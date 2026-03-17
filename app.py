"""
==============================================================================
  MediAssist — Flask Application (app.py)
  ────────────────────────────────────────
  Main application module for the MediAssist healthcare inventory system.

  REAL-TIME AUTOMATION ARCHITECTURE
  ─────────────────────────────────
  The Product Analysis (analytics) page reflects live inventory state WITHOUT
  any scheduler, cron job, or polling loop.  The mechanism is event-driven:

    1. TRIGGER EVENT
       A stock-changing action occurs (purchase, restock, manual adjustment).
       These are regular Flask route handlers — nothing special.

    2. SYNCHRONOUS HOOK
       Immediately after the DB commit that changes stock, the route calls:
           trigger_inventory_analysis(medicine_name)
       This function is the single point of integration between business
       logic and the rule engine.

    3. RULE ENGINE EXECUTION
       inventory_engine.py runs 5 independent rules against the medicine(s):
         • OUT_OF_STOCK    — stock = 0
         • CRITICAL_LOW    — stock ≤ 10
         • REORDER_REQUIRED — stock ≤ reorder_level (per-medicine)
         • EXPIRY_RISK     — expires within 60 days
         • REORDER         — projected demand × safety_factor > stock
       Alerts are upserted (delete-then-insert) into `realtime_alerts`.

    4. PAGE STAYS UPDATED
       The analytics page (Admin/analytics.html) calls REST endpoints on
       every page load:
         • /admin/inventory/dashboard  → summary cards & charts
         • /admin/inventory/alerts     → alerts table (severity-filterable)
         • /admin/inventory/stock      → stock levels table & bar chart
         • /admin/tft-predictions      → ML demand forecast cards
       Because step 3 already updated the DB, the page always shows the
       latest state.  After user actions on the page (Add Stock, Resolve
       Alert, Run Analysis), the page reloads data from the same endpoints.

  WHY THIS WORKS FOR RESEARCH
  ───────────────────────────
  • Deterministic: same stock state → same alerts, every time.
  • Testable: rules are pure functions in inventory_engine.py.
  • No race conditions: everything is synchronous within one request.
  • ML is read-only: TFT predictions feed into demand rules but are
    never retrained in the real-time path.
==============================================================================
"""

import os
import csv
import json
import re
import sys
import random
import secrets
import smtplib
import urllib.error
import urllib.request
from difflib import SequenceMatcher
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime, date, timedelta

# Load .env file so credentials are available via os.environ
try:
	from dotenv import load_dotenv
	load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))
except ImportError:
	pass  # python-dotenv not installed; rely on system env vars

from flask import Flask, has_request_context, jsonify, redirect, render_template, request, url_for
from flask_login import LoginManager, UserMixin, current_user, login_required, login_user, logout_user
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import func as sa_func  # For LOWER() in case-insensitive medicine lookups
from sqlalchemy import inspect as sa_inspect, text
from werkzeug.security import check_password_hash, generate_password_hash

# ─── Real-Time Inventory Analysis Engine ────────────────────────────────────
# Imported functions are called SYNCHRONOUSLY after every stock-changing event.
# No scheduler, no cron — the trigger is the DB write itself.
from inventory_engine import run_inventory_analysis, run_single_medicine_analysis

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")
MEDICINE_KEYWORD_MAP_PATH = os.path.join(BASE_DIR, "dataset", "medicine_keyword_map.csv")
MEDICINE_MASTER_DATASET_PATH = os.path.join(BASE_DIR, "A_Z_medicines_dataset_of_India.csv")
VALID_MEDICINE_CATEGORIES = {"M01AB", "M01AE", "N02BA", "N02BE", "N05B", "N05C", "R03", "R06"}


def env_flag(name, default=False):
	"""Parse common boolean env var forms (1/0, true/false, yes/no)."""
	raw = os.environ.get(name)
	if raw is None:
		return bool(default)
	return str(raw).strip().lower() in {"1", "true", "yes", "on"}


def normalize_database_url(raw_url):
	"""Normalize provider URLs to formats SQLAlchemy understands reliably."""
	if not raw_url:
		return raw_url
	url = raw_url.strip()
	if url.startswith("postgres://"):
		return "postgresql+psycopg2://" + url[len("postgres://"):]
	if url.startswith("postgresql://") and "+" not in url.split("://", 1)[0]:
		return "postgresql+psycopg2://" + url[len("postgresql://"):]
	return url


def is_localhost_database_url(url):
	"""Detect localhost database hosts that are invalid in serverless deployments."""
	if not url:
		return False
	match = re.search(r"://[^@/]*@([^:/?#]+)", url)
	if not match:
		return False
	host = (match.group(1) or "").strip().lower()
	return host in {"localhost", "127.0.0.1", "::1"}


def summarize_database_target(url):
	"""Return safe database target details without exposing credentials."""
	if not url:
		return {"driver": None, "host": None}

	driver = url.split("://", 1)[0] if "://" in url else None
	host = None
	match = re.search(r"://[^@/]*@([^:/?#]+)", url)
	if match:
		host = match.group(1)

	return {
		"driver": driver,
		"host": host,
	}


def resolve_secret_key():
	"""Use configured secret key or generate a secure fallback for local/dev use."""
	secret_key = (os.environ.get("SECRET_KEY") or "").strip()
	if secret_key:
		return secret_key

	generated = secrets.token_urlsafe(48)
	print("[Security Warning] SECRET_KEY not set. Using ephemeral key; set SECRET_KEY in deployment.")
	return generated


def resolve_database_url():
	"""Use env database URL when provided, else local SQLite fallback."""
	raw_db_url = (os.environ.get("DATABASE_URL") or "").strip()
	if raw_db_url:
		normalized = normalize_database_url(raw_db_url)
		if os.environ.get("VERCEL") and is_localhost_database_url(normalized):
			print("[Config Error] DATABASE_URL points to localhost on Vercel. Falling back to /tmp SQLite.")
			tmp_sqlite_path = os.path.join("/tmp", "mediassist.db")
			return f"sqlite:///{tmp_sqlite_path}"
		return normalized

	# Vercel filesystem is read-only except /tmp. Use /tmp fallback to avoid startup crashes
	# when DATABASE_URL is missing, while still allowing the app to boot.
	if os.environ.get("VERCEL"):
		tmp_sqlite_path = os.path.join("/tmp", "mediassist.db")
		print("[Config Warning] DATABASE_URL not set on Vercel. Using ephemeral SQLite at /tmp/mediassist.db")
		return f"sqlite:///{tmp_sqlite_path}"

	local_sqlite_path = os.path.join(BASE_DIR, "mediassist.db")
	print(f"[Config] DATABASE_URL not set. Using local SQLite: {local_sqlite_path}")
	return f"sqlite:///{local_sqlite_path}"

# Reload external keyword map only when file changes.
_CATEGORY_MAP_CACHE = {
	"mtime": None,
	"map": None,
}

_MEDICINE_NAME_CACHE = {
	"mtime": None,
	"exact_map": None,
	"normalized_names": None,
	"alias_map": None,
}

_MEDICINE_CANONICAL_RESULT_CACHE = {}

GENERIC_CANONICAL_MEDICINE_NAMES = {
	"paracetamol": "Paracetamol",
	"acetaminophen": "Paracetamol",
	"paracetmol": "Paracetamol",
	"paracitamol": "Paracetamol",
	"paracet": "Paracetamol",
	"aspirin": "Aspirin",
	"ibuprofen": "Ibuprofen",
	"diclofenac": "Diclofenac",
	"aceclofenac": "Aceclofenac",
	"azithromycin": "Azithromycin",
	"amoxicillin": "Amoxicillin",
	"amoxycillin": "Amoxycillin",
	"clavulanic acid": "Clavulanic Acid",
	"cetirizine": "Cetirizine",
	"levocetirizine": "Levocetirizine",
	"levocetrigen": "Levocetirizine",
	"levocetrizine": "Levocetirizine",
	"levo": "Levocetirizine",
	"fexofenadine": "Fexofenadine",
	"montelukast": "Montelukast",
	"salbutamol": "Salbutamol",
	"albuterol": "Salbutamol",
	"loratadine": "Loratadine",
	"dolo": "Dolo",
	"crocin": "Crocin",
	"calpol": "Calpol",
}

app = Flask(__name__, template_folder=TEMPLATES_DIR)
app.config["SECRET_KEY"] = resolve_secret_key()
app.config["SQLALCHEMY_DATABASE_URI"] = resolve_database_url()
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
engine_options = {"pool_pre_ping": True}
if str(app.config["SQLALCHEMY_DATABASE_URI"]).startswith("postgresql"):
	# Fail fast on unreachable DB in serverless to avoid opaque platform 503 timeouts.
	engine_options.update({
		"pool_recycle": 300,
		"connect_args": {"connect_timeout": 10},
	})
app.config["SQLALCHEMY_ENGINE_OPTIONS"] = engine_options
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = os.environ.get("SESSION_COOKIE_SAMESITE", "Lax")
app.config["SESSION_COOKIE_SECURE"] = env_flag("SESSION_COOKIE_SECURE", default=False)

db = SQLAlchemy(app)
login_manager = LoginManager(app)
login_manager.login_view = "login"


class User(UserMixin, db.Model):
	__tablename__ = "users"

	id = db.Column(db.Integer, primary_key=True)
	role = db.Column(db.String(20), nullable=False)  # 'user' or 'admin'
	email = db.Column(db.String(255), unique=True, nullable=True)
	mobile = db.Column(db.String(30), unique=True, nullable=True)
	password_hash = db.Column(db.String(255), nullable=True)
	is_active = db.Column(db.Boolean, default=True, nullable=False)
	must_change_password = db.Column(db.Boolean, default=False, nullable=False)
	created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

	def set_password(self, password):
		"""Hash and set the password"""
		self.password_hash = generate_password_hash(password)

	def check_password(self, password):
		"""Check if the provided password matches the stored hash"""
		return check_password_hash(self.password_hash, password)


class UserProfile(db.Model):
	__tablename__ = "user_profiles"

	id = db.Column(db.Integer, primary_key=True)
	user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, unique=True)
	full_name = db.Column(db.String(120), nullable=False)
	gender = db.Column(db.String(20), nullable=True)
	user_code = db.Column(db.String(30), unique=True, nullable=False)

	user = db.relationship("User", backref=db.backref("user_profile", uselist=False))


class Hospital(db.Model):
	__tablename__ = "hospitals"

	id = db.Column(db.Integer, primary_key=True)
	name = db.Column(db.String(200), nullable=False)
	hospital_type = db.Column(db.String(50), nullable=False)
	address = db.Column(db.String(255), nullable=False)
	contact = db.Column(db.String(50), nullable=False)
	license_number = db.Column(db.String(80), nullable=False)


class AdminProfile(db.Model):
	__tablename__ = "admin_profiles"

	id = db.Column(db.Integer, primary_key=True)
	user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, unique=True)
	full_name = db.Column(db.String(120), nullable=False)
	phone = db.Column(db.String(50), nullable=False)
	dob = db.Column(db.Date, nullable=False)
	gender = db.Column(db.String(20), nullable=False)
	address = db.Column(db.String(255), nullable=False)
	admin_role = db.Column(db.String(60), nullable=False)
	department = db.Column(db.String(60), nullable=False)
	permissions = db.Column(db.JSON, nullable=False)
	employee_id = db.Column(db.String(50), nullable=True)
	admin_notes = db.Column(db.Text, nullable=True)
	hospital_id = db.Column(db.Integer, db.ForeignKey("hospitals.id"), nullable=False)

	user = db.relationship("User", backref=db.backref("admin_profile", uselist=False))
	hospital = db.relationship("Hospital", backref=db.backref("admins", lazy=True))


class Purchase(db.Model):
	__tablename__ = "purchases"

	id = db.Column(db.Integer, primary_key=True)
	admin_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
	created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
	purchase_for = db.Column(db.String(30), nullable=True)
	child_name = db.Column(db.String(120), nullable=True)
	child_age = db.Column(db.Integer, nullable=True)
	child_gender = db.Column(db.String(20), nullable=True)
	purchaser_gender = db.Column(db.String(20), nullable=True)
	purchaser_age = db.Column(db.Integer, nullable=True)
	payment_method = db.Column(db.String(20), nullable=True)
	grand_total = db.Column(db.Numeric(10, 2), nullable=True)
	user_code = db.Column(db.String(30), nullable=True)
	user_full_name = db.Column(db.String(120), nullable=True)
	user_contact = db.Column(db.String(50), nullable=True)
	user_email = db.Column(db.String(255), nullable=True)

	admin = db.relationship("User", backref=db.backref("purchases", lazy=True))


class MedicineItem(db.Model):
	__tablename__ = "medicine_items"

	id = db.Column(db.Integer, primary_key=True)
	purchase_id = db.Column(db.Integer, db.ForeignKey("purchases.id"), nullable=False)
	name = db.Column(db.String(120), nullable=False)
	quantity = db.Column(db.Integer, nullable=False)
	unit_price = db.Column(db.Numeric(10, 2), nullable=False)
	total = db.Column(db.Numeric(10, 2), nullable=False)
	purchase_date = db.Column(db.Date, nullable=True)
	expiry_date = db.Column(db.Date, nullable=True)
	dosage = db.Column(db.String(30), nullable=True)
	custom_dosage = db.Column(db.String(255), nullable=True)

	purchase = db.relationship("Purchase", backref=db.backref("items", lazy=True, cascade="all, delete-orphan"))


class Prescription(db.Model):
	__tablename__ = "prescriptions"

	id = db.Column(db.Integer, primary_key=True)
	user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
	admin_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
	purchase_id = db.Column(db.Integer, db.ForeignKey("purchases.id"), nullable=True)
	medicine_name = db.Column(db.String(120), nullable=False)
	dosage = db.Column(db.String(255), nullable=True)
	quantity = db.Column(db.Integer, nullable=True)
	instructions = db.Column(db.Text, nullable=True)
	prescribed_for = db.Column(db.String(50), nullable=True)
	child_name = db.Column(db.String(120), nullable=True)
	child_age = db.Column(db.Integer, nullable=True)
	start_date = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
	end_date = db.Column(db.Date, nullable=True)
	is_active = db.Column(db.Boolean, default=True, nullable=False)
	
	# Enhanced dosage timing fields
	frequency_per_day = db.Column(db.Integer, nullable=True, default=1)  # How many times per day
	timing_relation = db.Column(db.String(20), nullable=True, default='AF')  # BF (Before Food), AF (After Food), WF (With Food), E (Empty Stomach)
	specific_times = db.Column(db.JSON, nullable=True)  # Array of specific times like ["08:00", "14:00", "20:00"]
	dosage_amount = db.Column(db.String(50), nullable=True)  # Amount per dose like "1 tablet", "5ml"
	
	user = db.relationship("User", foreign_keys=[user_id], backref=db.backref("prescriptions", lazy=True, cascade="all, delete-orphan"))
	admin = db.relationship("User", foreign_keys=[admin_id], backref=db.backref("prescribed_medicines", lazy=True))
	purchase = db.relationship("Purchase", backref=db.backref("prescriptions", lazy=True))


class TftPrediction(db.Model):
	__tablename__ = "tft_predictions"

	series_id = db.Column(db.String(50), primary_key=True)
	day_1 = db.Column(db.Float, nullable=False)
	day_2 = db.Column(db.Float, nullable=False)
	day_3 = db.Column(db.Float, nullable=False)
	day_4 = db.Column(db.Float, nullable=False)
	day_5 = db.Column(db.Float, nullable=False)
	day_6 = db.Column(db.Float, nullable=False)
	day_7 = db.Column(db.Float, nullable=False)


class InventoryAlert(db.Model):
	__tablename__ = "inventory_alerts"

	medicine_category = db.Column(db.String(50), primary_key=True)
	alert_type = db.Column(db.String(50), primary_key=True)
	avg_7day_demand = db.Column(db.Float, nullable=False)
	current_stock = db.Column(db.Integer, nullable=False)


# ─── Real-Time Inventory Models ─────────────────────────────────────────────

class MedicineStock(db.Model):
	"""
	Live inventory tracking table.
	Each row = one medicine with its current stock level, expiry, and category.
	Updated on every sale (stock decremented) or restock (stock incremented).

	KEY FIELDS FOR REAL-TIME ALERTS:
	  • current_stock : compared against reorder_level by the rule engine.
	  • reorder_level : per-medicine threshold. If current_stock ≤ this value,
	                    a REORDER_REQUIRED alert is generated automatically.
	  • expiry_date   : if within 60 days → EXPIRY_WARNING; ≤30 days → EXPIRY_RISK.
	  • category      : maps to TFT series_id for demand-based REORDER alerts.

	AUTOMATION FLOW:
	  DB write to this table  →  trigger_inventory_analysis()  →  alerts upserted
	"""
	__tablename__ = "medicine_stock"

	id = db.Column(db.Integer, primary_key=True)
	medicine_name = db.Column(db.String(200), unique=True, nullable=False)
	category = db.Column(db.String(50), nullable=True)  # Maps to TFT series_id for demand lookup
	current_stock = db.Column(db.Integer, nullable=False, default=0)
	unit_price = db.Column(db.Numeric(10, 2), nullable=True)
	expiry_date = db.Column(db.Date, nullable=True)
	reorder_level = db.Column(db.Integer, nullable=True, default=30)
	supplier = db.Column(db.String(200), nullable=True)
	last_restocked = db.Column(db.DateTime, nullable=True)
	last_sold = db.Column(db.DateTime, nullable=True)
	created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
	updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class StockMovement(db.Model):
	"""Track stock deltas so live demand includes manual stock reductions."""
	__tablename__ = "stock_movements"

	id = db.Column(db.Integer, primary_key=True)
	medicine_name = db.Column(db.String(200), nullable=False)
	category = db.Column(db.String(50), nullable=True)
	quantity_change = db.Column(db.Integer, nullable=False)  # negative=consumed
	reason = db.Column(db.String(50), nullable=True)
	created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)


class RealTimeAlert(db.Model):
	"""
	Real-time inventory alerts generated automatically by the rule engine.
	These are NOT manually created — they are upserted by inventory_engine.py
	after every stock-changing event.

	LIFECYCLE:
	  1. Stock changes (purchase / restock / manual edit).
	  2. trigger_inventory_analysis() calls the rule engine.
	  3. Old alerts for the affected medicine are deleted.
	  4. New alerts (if any) are inserted based on current state.
	  5. The analytics page fetches /admin/inventory/alerts → shows latest.

	NOTE: is_resolved=True means a human acknowledged the alert.  On the
	next stock change the engine will delete old alerts and re-evaluate,
	so stale resolved alerts are automatically cleaned up.
	"""
	__tablename__ = "realtime_alerts"

	id = db.Column(db.Integer, primary_key=True)
	medicine_name = db.Column(db.String(200), nullable=False)
	medicine_category = db.Column(db.String(50), nullable=True)
	alert_type = db.Column(db.String(50), nullable=False)  # OUT_OF_STOCK, REORDER_REQUIRED, EXPIRY_RISK, etc.
	severity = db.Column(db.String(20), nullable=False, default="MEDIUM")  # CRITICAL, HIGH, MEDIUM
	current_stock = db.Column(db.Integer, nullable=False, default=0)
	threshold = db.Column(db.Integer, nullable=True)
	message = db.Column(db.Text, nullable=False)
	extra_data = db.Column(db.JSON, nullable=True)  # Additional context (days_until_expiry, demand, etc.)
	created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
	is_resolved = db.Column(db.Boolean, default=False, nullable=False)



class PasswordResetToken(db.Model):
	"""Stores OTPs for password reset via email or mobile."""
	__tablename__ = "password_reset_tokens"

	id = db.Column(db.Integer, primary_key=True)
	user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
	otp = db.Column(db.String(10), nullable=False)
	method = db.Column(db.String(20), nullable=False)  # 'email' or 'mobile'
	identifier = db.Column(db.String(255), nullable=False)  # email address or mobile number
	expires_at = db.Column(db.DateTime, nullable=False)
	is_used = db.Column(db.Boolean, default=False, nullable=False)
	created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

	user = db.relationship("User", backref=db.backref("reset_tokens", lazy=True))


class LoginOtpToken(db.Model):
	"""Stores OTPs for sign-in via mobile SMS (user login)."""
	__tablename__ = "login_otp_tokens"

	id = db.Column(db.Integer, primary_key=True)
	user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
	mobile = db.Column(db.String(30), nullable=False)
	otp = db.Column(db.String(10), nullable=False)
	expires_at = db.Column(db.DateTime, nullable=False)
	is_used = db.Column(db.Boolean, default=False, nullable=False)
	created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

	user = db.relationship("User", backref=db.backref("login_otp_tokens", lazy=True))


def ensure_database_schema():
	"""
	Create missing tables and backfill newer columns on existing tables.

	`db.create_all()` creates tables but does not ALTER old tables. Admin pages can
	fail with "column does not exist" when running against a pre-update database,
	so we patch required columns at startup in a safe, additive way.
	"""
	try:
		db.create_all()
	except Exception as exc:
		print(f"[DB Init Warning] create_all failed: {exc}")
		return

	# Table -> missing column definitions by dialect.
	schema_patches = {
		"users": {
			"must_change_password": {
				"default": "must_change_password BOOLEAN DEFAULT FALSE"
			},
		},
		"prescriptions": {
			"frequency_per_day": {
				"default": "frequency_per_day INTEGER DEFAULT 1"
			},
			"timing_relation": {
				"default": "timing_relation VARCHAR(20) DEFAULT 'AF'"
			},
			"specific_times": {
				"postgresql": "specific_times JSON",
				"sqlite": "specific_times TEXT",
				"default": "specific_times TEXT",
			},
			"dosage_amount": {
				"default": "dosage_amount VARCHAR(50)"
			},
		},
		"medicine_stock": {
			"category": {
				"default": "category VARCHAR(50)"
			},
			"reorder_level": {
				"default": "reorder_level INTEGER DEFAULT 30"
			},
			"supplier": {
				"default": "supplier VARCHAR(200)"
			},
			"last_restocked": {
				"default": "last_restocked TIMESTAMP"
			},
			"last_sold": {
				"default": "last_sold TIMESTAMP"
			},
			"created_at": {
				"default": "created_at TIMESTAMP"
			},
			"updated_at": {
				"default": "updated_at TIMESTAMP"
			},
		},
		"realtime_alerts": {
			"medicine_category": {
				"default": "medicine_category VARCHAR(50)"
			},
			"alert_type": {
				"default": "alert_type VARCHAR(50)"
			},
			"severity": {
				"default": "severity VARCHAR(20) DEFAULT 'MEDIUM'"
			},
			"current_stock": {
				"default": "current_stock INTEGER DEFAULT 0"
			},
			"threshold": {
				"default": "threshold INTEGER"
			},
			"message": {
				"default": "message TEXT"
			},
			"extra_data": {
				"postgresql": "extra_data JSON",
				"sqlite": "extra_data TEXT",
				"default": "extra_data TEXT",
			},
			"created_at": {
				"default": "created_at TIMESTAMP"
			},
			"is_resolved": {
				"default": "is_resolved BOOLEAN DEFAULT FALSE"
			},
		},
	}

	added_columns = []
	try:
		with db.engine.begin() as conn:
			inspector = sa_inspect(conn)
			dialect = conn.dialect.name
			existing_tables = set(inspector.get_table_names())

			for table_name, columns in schema_patches.items():
				if table_name not in existing_tables:
					continue

				existing_column_names = {col["name"] for col in inspector.get_columns(table_name)}

				for column_name, ddl_by_dialect in columns.items():
					if column_name in existing_column_names:
						continue

					column_ddl = ddl_by_dialect.get(dialect) or ddl_by_dialect["default"]
					conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_ddl}"))
					existing_column_names.add(column_name)
					added_columns.append(f"{table_name}.{column_name}")

		if added_columns:
			print(f"[DB Init] Added missing columns: {', '.join(added_columns)}")
	except Exception as exc:
		print(f"[DB Init Warning] Schema compatibility patch skipped: {exc}")


_schema_checked = False


@app.before_request
def ensure_database_schema_once():
	"""Run schema compatibility check once per process for flask run / WSGI."""
	global _schema_checked
	if _schema_checked:
		return None
	try:
		ensure_database_schema()
	except Exception as exc:
		# Never block request rendering for pages like login on startup.
		print(f"[DB Init Warning] Schema init failed in before_request: {exc}")
	_schema_checked = True
	return None


# ─── Password Reset Helpers ──────────────────────────────────────────────────

def send_reset_email_via_emailjs(to_email: str, otp: str) -> bool:
	"""Send OTP via EmailJS using server-side HTTP request."""
	public_key = (os.environ.get("EMAILJS_PUBLIC_KEY") or "").strip()
	service_id = (os.environ.get("EMAILJS_SERVICE_ID") or "").strip()
	template_id = (os.environ.get("EMAILJS_TEMPLATE_ID") or "").strip()
	private_key = (os.environ.get("EMAILJS_PRIVATE_KEY") or "").strip()
	app_base_url = (os.environ.get("APP_BASE_URL") or "").strip().rstrip("/")

	if not public_key or not service_id or not template_id:
		raise RuntimeError(
			"EmailJS is not configured. Set EMAILJS_PUBLIC_KEY, EMAILJS_SERVICE_ID, and EMAILJS_TEMPLATE_ID."
		)

	payload = {
		"service_id": service_id,
		"template_id": template_id,
		"user_id": public_key,
		"template_params": {
			"to_email": to_email,
			"otp_code": otp,
			"user_name": "User",
		},
	}
	if private_key:
		payload["accessToken"] = private_key

	headers = {"Content-Type": "application/json"}
	origin = app_base_url
	if not origin and has_request_context():
		origin = request.host_url.rstrip("/")
	if origin:
		headers["Origin"] = origin
		headers["Referer"] = origin + "/"

	emailjs_request = urllib.request.Request(
		"https://api.emailjs.com/api/v1.0/email/send",
		data=json.dumps(payload).encode("utf-8"),
		headers=headers,
		method="POST",
	)

	try:
		with urllib.request.urlopen(emailjs_request, timeout=15) as response:
			status_code = getattr(response, "status", response.getcode())
			if status_code not in (200, 201):
				raise RuntimeError(f"EmailJS delivery failed with status {status_code}.")
		return True
	except urllib.error.HTTPError as exc:
		error_body = exc.read().decode("utf-8", errors="ignore")
		print(f"[EmailJS Error] HTTP {exc.code}: {error_body}")
		if exc.code == 403:
			raise RuntimeError(
				"EmailJS rejected the request (403). Check service/template IDs, EMAILJS_PRIVATE_KEY, and EmailJS origin allowlist settings. If allowlisting is enabled, set APP_BASE_URL to your app URL."
			) from exc
		raise RuntimeError(f"EmailJS delivery failed with status {exc.code}.") from exc
	except urllib.error.URLError as exc:
		print(f"[EmailJS Error] {exc}")
		raise RuntimeError("Could not reach EmailJS service.") from exc


def send_reset_email(to_email: str, otp: str) -> bool:
	"""
	Send OTP via EmailJS when configured, otherwise SMTP.
	"""
	emailjs_public_key = (os.environ.get("EMAILJS_PUBLIC_KEY") or "").strip()
	emailjs_service_id = (os.environ.get("EMAILJS_SERVICE_ID") or "").strip()
	emailjs_template_id = (os.environ.get("EMAILJS_TEMPLATE_ID") or "").strip()

	if emailjs_public_key and emailjs_service_id and emailjs_template_id:
		return send_reset_email_via_emailjs(to_email, otp)

	smtp_host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
	smtp_port = int(os.environ.get("SMTP_PORT", "587"))
	smtp_user = os.environ.get("SMTP_USER", "")
	smtp_pass = os.environ.get("SMTP_PASS", "")

	if not smtp_user or not smtp_pass:
		raise RuntimeError("Email service is not configured. Set SMTP_USER and SMTP_PASS.")

	try:
		msg = MIMEMultipart("alternative")
		msg["Subject"] = "MediAssist — Password Reset OTP"
		msg["From"] = smtp_user
		msg["To"] = to_email
		html_body = f"""
		<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:30px;border:1px solid #e0e0e0;border-radius:10px">
		  <h2 style="color:#2A5C82">MediAssist Password Reset</h2>
		  <p>Use the OTP below to reset your password. It is valid for <strong>10 minutes</strong>.</p>
		  <div style="font-size:2rem;font-weight:bold;letter-spacing:8px;text-align:center;padding:20px;background:#f0f7ff;border-radius:8px;color:#2A5C82">{otp}</div>
		  <p style="color:#888;font-size:0.85rem;margin-top:20px">If you did not request a password reset, ignore this email.</p>
		</div>
		"""
		msg.attach(MIMEText(html_body, "html"))
		with smtplib.SMTP(smtp_host, smtp_port) as server:
			server.starttls()
			server.login(smtp_user, smtp_pass)
			server.sendmail(smtp_user, to_email, msg.as_string())
		return True
	except Exception as exc:
		print(f"[Email Error] {exc}")
		raise RuntimeError(str(exc)) from exc


def send_reset_sms(to_mobile: str, otp: str, message: str | None = None) -> bool:
	"""
	Send OTP via Twilio SMS.
	Auto-prepends +91 (India) country code when not already present.
	Raises RuntimeError if credentials are missing or Twilio rejects the request.
	Pass a custom `message` to override the default password-reset text.
	"""
	twilio_sid   = os.environ.get("TWILIO_ACCOUNT_SID", "")
	twilio_token = os.environ.get("TWILIO_AUTH_TOKEN", "")
	twilio_from  = os.environ.get("TWILIO_FROM_NUMBER", "")

	if not twilio_sid or not twilio_token or not twilio_from:
		raise RuntimeError("SMS service is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER.")

	# Normalise to E.164 format — add +91 (India) if no country code present
	normalized = to_mobile.strip()
	if not normalized.startswith("+"):
		# Strip any leading zeros then prepend India country code
		normalized = "+91" + normalized.lstrip("0")

	try:
		from twilio.rest import Client  # noqa: PLC0415
		client = Client(twilio_sid, twilio_token)
		sms_body = message if message else (
			f"MediAssist: Your password reset OTP is {otp}. "
			f"Valid for 10 minutes. Do not share this OTP."
		)
		message_obj = client.messages.create(
			body=sms_body,
			from_=twilio_from,
			to=normalized,
		)
		print(f"[SMS] Sent to {normalized} — SID: {message_obj.sid}")
		return True
	except Exception as exc:
		print(f"[SMS Error] {exc}")
		# Re-raise so the caller can return a proper HTTP error to the user
		raise RuntimeError(str(exc)) from exc


# ─── Event-Driven Trigger Helper ────────────────────────────────────────────

def format_dosage_display(prescription):
	"""
	Format dosage display with timing information for user-friendly display.
	Returns formatted string like "2 Times AF" or "1 Time BF" etc.
	Handles both new enhanced fields and legacy data gracefully.
	"""
	if not prescription:
		return {
			'short': 'As prescribed',
			'full': 'As prescribed',
			'times': [],
			'amount': 'As needed'
		}
	
	# Get values with safe defaults
	frequency = getattr(prescription, 'frequency_per_day', None) or 1
	timing = getattr(prescription, 'timing_relation', None) or 'AF'
	amount = getattr(prescription, 'dosage_amount', None) or prescription.dosage or "1 dose"
	specific_times = get_prescription_dose_times(prescription)
	
	# Timing abbreviations mapping
	timing_map = {
		'BF': 'Before Food',
		'AF': 'After Food', 
		'WF': 'With Food',
		'E': 'Empty Stomach',
		'AN': 'Anytime'
	}
	
	timing_short_map = {
		'BF': 'BF',
		'AF': 'AF',
		'WF': 'WF', 
		'E': 'ES',
		'AN': 'AN'
	}
	
	# Format frequency
	freq_text = f"{frequency} Time{'s' if frequency > 1 else ''}"
	timing_text = timing_short_map.get(timing, timing)
	
	# Create display format
	display = f"{freq_text} {timing_text}"
	
	# Add specific times if available
	if specific_times and len(specific_times) > 0:
		times_str = ", ".join(specific_times)
		display += f" ({times_str})"
	
	return {
		'short': display,
		'full': f"{amount} - {freq_text} {timing_map.get(timing, timing)}",
		'times': specific_times,
		'amount': amount
	}


DEFAULT_DOSAGE_TIMES_BY_FREQUENCY = {
	1: ["09:00"],
	2: ["09:00", "21:00"],
	3: ["08:00", "14:00", "20:00"],
	4: ["06:00", "12:00", "18:00", "22:00"],
}


def get_default_dose_times(frequency_per_day):
	"""Return sensible default dose times for a given daily frequency."""
	try:
		frequency = int(frequency_per_day or 1)
	except (ValueError, TypeError):
		frequency = 1
	frequency = max(1, min(frequency, 4))
	return DEFAULT_DOSAGE_TIMES_BY_FREQUENCY.get(frequency, DEFAULT_DOSAGE_TIMES_BY_FREQUENCY[1])[:]


def sanitize_dose_times(raw_times):
	"""Normalize a list of time strings to HH:MM format and sort them."""
	if not isinstance(raw_times, list):
		return []

	sanitized = []
	seen = set()
	for raw in raw_times:
		value = (str(raw or "").strip())
		if not value:
			continue
		try:
			parsed = datetime.strptime(value, "%H:%M").time()
		except ValueError:
			continue
		time_text = parsed.strftime("%H:%M")
		if time_text in seen:
			continue
		seen.add(time_text)
		sanitized.append(time_text)

	sanitized.sort()
	return sanitized


def get_prescription_dose_times(prescription):
	"""Resolve stored specific times or fallback defaults for schedule math."""
	specific_times = sanitize_dose_times(getattr(prescription, "specific_times", None))
	if specific_times:
		return specific_times

	return get_default_dose_times(getattr(prescription, "frequency_per_day", 1))


def count_scheduled_doses_between(start_dt, end_dt, dose_times):
	"""Count how many scheduled dose times fall within [start_dt, end_dt]."""
	if not dose_times or not start_dt or not end_dt or end_dt < start_dt:
		return 0

	parsed_times = []
	for time_text in dose_times:
		try:
			parsed_times.append(datetime.strptime(time_text, "%H:%M").time())
		except ValueError:
			continue

	if not parsed_times:
		return 0

	total = 0
	day_count = (end_dt.date() - start_dt.date()).days + 1
	for offset in range(day_count):
		current_day = start_dt.date() + timedelta(days=offset)
		for dose_time in parsed_times:
			candidate = datetime.combine(current_day, dose_time)
			if candidate < start_dt or candidate > end_dt:
				continue
			total += 1

	return total


def find_next_scheduled_dose(start_dt, now_dt, dose_times, end_date=None):
	"""Find the next scheduled dose datetime after now_dt."""
	if not dose_times:
		return None

	parsed_times = []
	for time_text in dose_times:
		try:
			parsed_times.append(datetime.strptime(time_text, "%H:%M").time())
		except ValueError:
			continue

	if not parsed_times:
		return None

	parsed_times.sort()
	start_day = max(now_dt.date(), start_dt.date())
	max_day = start_day + timedelta(days=14)
	if end_date:
		max_day = min(max_day, end_date)

	current_day = start_day
	while current_day <= max_day:
		for dose_time in parsed_times:
			candidate = datetime.combine(current_day, dose_time)
			if candidate <= now_dt or candidate < start_dt:
				continue
			return candidate
		current_day += timedelta(days=1)

	return None


def format_next_dose_text(next_dose_dt, now_dt):
	"""Format next dose datetime into a compact user-facing label."""
	if not next_dose_dt:
		return "Completed"

	if next_dose_dt.date() == now_dt.date():
		return next_dose_dt.strftime("%H:%M")
	if next_dose_dt.date() == (now_dt.date() + timedelta(days=1)):
		return f"Tomorrow {next_dose_dt.strftime('%H:%M')}"
	return next_dose_dt.strftime("%d %b %H:%M")


def get_prescription_progress_status(prescription, reference_dt=None):
	"""Compute real-time dose progress and lifecycle status for a prescription."""
	now_dt = reference_dt or datetime.utcnow()
	start_dt = prescription.start_date or now_dt
	end_date = get_effective_prescription_end_date(prescription)
	dose_times = get_prescription_dose_times(prescription)

	total_doses = None
	try:
		quantity_value = int(prescription.quantity) if prescription.quantity is not None else None
		if quantity_value and quantity_value > 0:
			total_doses = quantity_value
	except (TypeError, ValueError):
		total_doses = None

	doses_taken = count_scheduled_doses_between(start_dt, now_dt, dose_times)
	if total_doses is not None:
		doses_taken = min(doses_taken, total_doses)
		doses_remaining = max(total_doses - doses_taken, 0)
	else:
		doses_remaining = None

	is_over_by_quantity = total_doses is not None and doses_remaining <= 0
	is_over_by_date = end_date is not None and now_dt.date() > end_date
	status = "over" if (is_over_by_quantity or is_over_by_date) else "active"

	next_dose_dt = None
	if status == "active":
		next_dose_dt = find_next_scheduled_dose(start_dt, now_dt, dose_times, end_date=end_date)
		if total_doses is not None and doses_remaining <= 0:
			next_dose_dt = None

	return {
		"status": status,
		"doses_taken": doses_taken,
		"doses_total": total_doses,
		"doses_remaining": doses_remaining,
		"next_dose_text": format_next_dose_text(next_dose_dt, now_dt),
		"next_dose_at": next_dose_dt.strftime("%Y-%m-%d %H:%M:%S") if next_dose_dt else None,
		"dose_times": dose_times,
	}


def trigger_inventory_analysis(medicine_name: str = None):
	"""
	EVENT HOOK — called automatically after any stock-changing operation.

	If medicine_name is provided → runs targeted single-medicine analysis.
	If medicine_name is None     → runs full inventory scan.

	This is the CORE of the real-time automation:
	  Sale recorded  ──►  stock decremented  ──►  trigger_inventory_analysis()
	  Restock added  ──►  stock incremented  ──►  trigger_inventory_analysis()
	  Stock edited   ──►  stock adjusted     ──►  trigger_inventory_analysis()

	The analytics page does NOT need to call this — it just reads the DB.
	Alerts are already up-to-date by the time the page fetches data.

	NOTE: medicine_name is stripped but NOT lowered here — the downstream
	functions (run_single_medicine_analysis) use LOWER() in their DB queries,
	so any casing variant will match correctly.
	"""
	try:
		# Normalize whitespace (casing handled by DB-level LOWER() queries)
		if medicine_name:
			medicine_name = medicine_name.strip()
		if medicine_name:
			# Targeted: only re-evaluate the one medicine whose stock changed.
			# More efficient than a full scan for single-item updates.
			result = run_single_medicine_analysis(
				db,
				MedicineStock,
				RealTimeAlert,
				medicine_name,
				TftPrediction,
				Purchase,
				MedicineItem,
				StockMovement,
				7,
			)
		else:
			# Full scan: re-evaluate every medicine.  Used for bulk imports
			# or the manual "Run Analysis" button on the analytics page.
			result = run_inventory_analysis(
				db,
				MedicineStock,
				RealTimeAlert,
				TftPrediction,
				Purchase,
				MedicineItem,
				StockMovement,
				7,
			)
		print(f"[AutoTrigger] Inventory analysis result: {result}")
		return result
	except Exception as e:
		print(f"[AutoTrigger] Error during inventory analysis: {e}")
		return {"triggered": False, "error": str(e)}


@login_manager.user_loader
def load_user(user_id):
	return db.session.get(User, int(user_id))


def parse_request_data():
	if request.is_json:
		return request.get_json(silent=True) or {}
	return request.form.to_dict(flat=True)


def generate_user_code():
	year = datetime.utcnow().year
	for _ in range(5):
		code = f"P-{year}-{random.randint(1000, 9999)}"
		if not UserProfile.query.filter_by(user_code=code).first():
			return code
	raise ValueError("Unable to generate unique user code")


def normalize_medicine_category(category_value):
	"""Normalize category codes (e.g. ' n02be ' -> 'N02BE')."""
	if category_value is None:
		return None
	normalized = str(category_value).strip().upper()
	if not normalized:
		return None
	if normalized in VALID_MEDICINE_CATEGORIES:
		return normalized
	return None


def normalize_medicine_text(text):
	"""Normalize medicine names to improve robust keyword matching."""
	normalized = (text or "").strip().lower()
	normalized = normalized.replace("+", " plus ")
	normalized = re.sub(r"[^a-z0-9\s]", " ", normalized)
	normalized = re.sub(r"\s+", " ", normalized).strip()
	return normalized


def strip_medicine_noise_tokens(normalized_name):
	"""Remove dosage/form noise so matching focuses on medicine identity."""
	if not normalized_name:
		return ""

	cleaned = re.sub(
		r"\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|kg|ml|l|iu|%)?\b",
		" ",
		normalized_name,
	)
	cleaned = re.sub(
		r"\b(?:tablet|tablets|tab|capsule|capsules|cap|syrup|injection|inj|cream|ointment|drops|strip|pack|dose|dsr|sr|er|mr|xl)\b",
		" ",
		cleaned,
	)
	cleaned = re.sub(r"\s+", " ", cleaned).strip()
	return cleaned or normalized_name


def to_clean_display_name(name):
	"""Fallback display formatter for unknown names."""
	raw = re.sub(r"\s+", " ", (name or "").strip())
	if not raw:
		return ""

	words = []
	for token in raw.split(" "):
		if re.fullmatch(r"\d+(?:\.\d+)?(?:mg|mcg|g|kg|ml|l|iu|%)?", token.lower()):
			words.append(token.upper().replace("MG", "mg").replace("MCG", "mcg").replace("ML", "ml"))
		else:
			words.append(token.capitalize())
	return " ".join(words)


def load_medicine_name_index():
	"""Load canonical medicine names from dataset with mtime-based caching."""
	try:
		mtime = os.path.getmtime(MEDICINE_MASTER_DATASET_PATH)
	except OSError:
		_MEDICINE_NAME_CACHE["mtime"] = None
		_MEDICINE_NAME_CACHE["exact_map"] = {}
		_MEDICINE_NAME_CACHE["normalized_names"] = []
		_MEDICINE_NAME_CACHE["alias_map"] = {}
		return {}, [], {}

	if (
		_MEDICINE_NAME_CACHE["exact_map"] is not None
		and _MEDICINE_NAME_CACHE["normalized_names"] is not None
		and _MEDICINE_NAME_CACHE["alias_map"] is not None
		and _MEDICINE_NAME_CACHE["mtime"] == mtime
	):
		return (
			_MEDICINE_NAME_CACHE["exact_map"],
			_MEDICINE_NAME_CACHE["normalized_names"],
			_MEDICINE_NAME_CACHE["alias_map"],
		)

	exact_map = {}
	normalized_names = []
	alias_candidates = {}

	def add_alias(alias_key, canonical_display):
		if not alias_key or len(alias_key) < 3:
			return
		alias_candidates.setdefault(alias_key, set()).add(canonical_display)

	try:
		with open(MEDICINE_MASTER_DATASET_PATH, "r", encoding="utf-8", newline="") as csv_file:
			reader = csv.DictReader(csv_file)
			for row in reader:
				canonical_name = (row.get("name") or "").strip()
				if not canonical_name:
					continue

				normalized_name = normalize_medicine_text(canonical_name)
				if not normalized_name:
					continue

				# Keep first occurrence as canonical brand formatting.
				display_name = exact_map.setdefault(normalized_name, canonical_name)
				add_alias(normalized_name, display_name)

				base_name = strip_medicine_noise_tokens(normalized_name)
				if base_name and base_name != normalized_name:
					add_alias(base_name, display_name)

				for comp_field in ("short_composition1", "short_composition2"):
					comp_raw = (row.get(comp_field) or "").strip()
					if not comp_raw:
						continue
					comp_clean = re.sub(r"\([^)]*\)", " ", comp_raw)
					comp_clean = re.sub(r"\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|kg|ml|l|iu|%)?\b", " ", comp_clean, flags=re.IGNORECASE)
					comp_norm = normalize_medicine_text(comp_clean)
					if comp_norm:
						# Map composition alias to readable generic display.
						generic_display = " ".join(word.capitalize() for word in comp_norm.split())
						add_alias(comp_norm, generic_display)

		normalized_names = list(exact_map.keys())
		alias_map = {
			alias: next(iter(displays))
			for alias, displays in alias_candidates.items()
			if len(displays) == 1
		}
	except Exception as e:
		print(f"[MedicineNameMap] Failed to load medicine dataset: {e}")
		exact_map = {}
		normalized_names = []
		alias_map = {}

	_MEDICINE_NAME_CACHE["mtime"] = mtime
	_MEDICINE_NAME_CACHE["exact_map"] = exact_map
	_MEDICINE_NAME_CACHE["normalized_names"] = normalized_names
	_MEDICINE_NAME_CACHE["alias_map"] = alias_map
	_MEDICINE_CANONICAL_RESULT_CACHE.clear()
	return exact_map, normalized_names, alias_map


def canonicalize_medicine_name(raw_name, use_dataset_fuzzy=True):
	"""
	Return a well-formatted canonical medicine name for display/storage.

	Uses exact + fuzzy matching against known generic names and the local
	medicine dataset so minor misspellings are auto-corrected.
	"""
	name = (raw_name or "").strip()
	if not name:
		return ""

	normalized_name = normalize_medicine_text(name)
	if not normalized_name:
		return to_clean_display_name(name)

	if normalized_name in _MEDICINE_CANONICAL_RESULT_CACHE:
		return _MEDICINE_CANONICAL_RESULT_CACHE[normalized_name]

	base_name = strip_medicine_noise_tokens(normalized_name)

	# 1) Exact generic map hits.
	if normalized_name in GENERIC_CANONICAL_MEDICINE_NAMES:
		result = GENERIC_CANONICAL_MEDICINE_NAMES[normalized_name]
		_MEDICINE_CANONICAL_RESULT_CACHE[normalized_name] = result
		return result
	if base_name in GENERIC_CANONICAL_MEDICINE_NAMES:
		result = GENERIC_CANONICAL_MEDICINE_NAMES[base_name]
		_MEDICINE_CANONICAL_RESULT_CACHE[normalized_name] = result
		return result

	# 2) Substring generic hit (e.g. "paracitamol 500" -> Paracetamol).
	for generic_norm, generic_display in GENERIC_CANONICAL_MEDICINE_NAMES.items():
		if generic_norm in normalized_name or generic_norm in base_name:
			_MEDICINE_CANONICAL_RESULT_CACHE[normalized_name] = generic_display
			return generic_display

	# 3) Fuzzy against generic names first (higher confidence for common meds).
	best_generic_name = None
	best_generic_score = 0.0
	for generic_norm, generic_display in GENERIC_CANONICAL_MEDICINE_NAMES.items():
		score = max(
			SequenceMatcher(None, normalized_name, generic_norm).ratio(),
			SequenceMatcher(None, base_name, generic_norm).ratio(),
		)
		if score > best_generic_score:
			best_generic_score = score
			best_generic_name = generic_display
	if best_generic_name and best_generic_score >= 0.84:
		_MEDICINE_CANONICAL_RESULT_CACHE[normalized_name] = best_generic_name
		return best_generic_name

	# 3b) Token-level fuzzy to catch cases like "paracetmol 650".
	for token in base_name.split():
		if len(token) < 4:
			continue
		for generic_norm, generic_display in GENERIC_CANONICAL_MEDICINE_NAMES.items():
			score = SequenceMatcher(None, token, generic_norm).ratio()
			if score >= 0.84:
				_MEDICINE_CANONICAL_RESULT_CACHE[normalized_name] = generic_display
				return generic_display

	# Fast mode for user-facing list/details: skip expensive dataset fuzzy scan.
	if not use_dataset_fuzzy:
		result = to_clean_display_name(name)
		_MEDICINE_CANONICAL_RESULT_CACHE[normalized_name] = result
		return result

	# 4) Exact dataset hits / aliases.
	exact_map, normalized_dataset_names, alias_map = load_medicine_name_index()
	if normalized_name in exact_map:
		result = exact_map[normalized_name]
		_MEDICINE_CANONICAL_RESULT_CACHE[normalized_name] = result
		return result
	if base_name in exact_map:
		result = exact_map[base_name]
		_MEDICINE_CANONICAL_RESULT_CACHE[normalized_name] = result
		return result

	# 4b) Alias hits (brand short forms + composition names).
	if normalized_name in alias_map:
		result = alias_map[normalized_name]
		_MEDICINE_CANONICAL_RESULT_CACHE[normalized_name] = result
		return result
	if base_name in alias_map:
		result = alias_map[base_name]
		_MEDICINE_CANONICAL_RESULT_CACHE[normalized_name] = result
		return result
	base_tokens_for_alias = base_name.split()
	if len(base_tokens_for_alias) == 1:
		token = base_tokens_for_alias[0]
		if token in alias_map:
			result = alias_map[token]
			_MEDICINE_CANONICAL_RESULT_CACHE[normalized_name] = result
			return result

	# 5) Fuzzy against dataset names with quick prefilter for speed.
	best_dataset_norm = None
	best_dataset_score = 0.0
	second_best_dataset_score = 0.0
	best_dataset_seq_score = 0.0
	best_dataset_token_overlap = 0.0
	best_overlap_count = 0
	first_char = base_name[0] if base_name else normalized_name[0]
	name_len = len(base_name) if base_name else len(normalized_name)
	base_tokens = set(base_name.split())
	candidates = [
		candidate
		for candidate in normalized_dataset_names
		if candidate and candidate[0] == first_char and abs(len(candidate) - name_len) <= 16
	]
	if not candidates:
		candidates = normalized_dataset_names[:]

	for candidate in candidates:
		candidate_base = strip_medicine_noise_tokens(candidate)
		seq_score = max(
			SequenceMatcher(None, normalized_name, candidate).ratio(),
			SequenceMatcher(None, base_name, candidate).ratio(),
			SequenceMatcher(None, base_name, candidate_base).ratio(),
		)
		candidate_tokens = set(candidate_base.split())
		token_overlap = 0.0
		overlap_count = 0
		if base_tokens and candidate_tokens:
			overlap_count = len(base_tokens & candidate_tokens)
			token_overlap = overlap_count / max(len(base_tokens), len(candidate_tokens))

		score = (seq_score * 0.85) + (token_overlap * 0.15)
		if score > best_dataset_score:
			second_best_dataset_score = best_dataset_score
			best_dataset_score = score
			best_dataset_norm = candidate
			best_dataset_seq_score = seq_score
			best_dataset_token_overlap = token_overlap
			best_overlap_count = overlap_count
		elif score > second_best_dataset_score:
			second_best_dataset_score = score

	confidence_gap = best_dataset_score - second_best_dataset_score
	multi_token_confident = True
	if len(base_tokens) >= 2:
		multi_token_confident = best_overlap_count >= 2 or best_dataset_token_overlap >= 0.60

	is_confident_dataset_match = (
		best_dataset_norm is not None
		and multi_token_confident
		and (
			# Strong direct similarity
			best_dataset_seq_score >= 0.92
			# Or reasonable similarity with some shared keyword/token evidence
			or (best_dataset_seq_score >= 0.86 and best_dataset_token_overlap >= 0.20)
		)
		and confidence_gap >= 0.03
	)

	if is_confident_dataset_match:
		result = exact_map.get(best_dataset_norm, name)
		_MEDICINE_CANONICAL_RESULT_CACHE[normalized_name] = result
		return result

	# Fallback: preserve meaning but present clean formatting.
	result = to_clean_display_name(name)
	_MEDICINE_CANONICAL_RESULT_CACHE[normalized_name] = result
	return result


def load_external_category_keyword_map():
	"""
	Load keyword map from dataset/medicine_keyword_map.csv if present.

	Supported columns:
	  - category (required)
	  - keyword (optional)
	  - aliases (optional, pipe/comma/semicolon separated)
	  - medicine_name (optional)
	"""
	try:
		mtime = os.path.getmtime(MEDICINE_KEYWORD_MAP_PATH)
	except OSError:
		_CATEGORY_MAP_CACHE["mtime"] = None
		_CATEGORY_MAP_CACHE["map"] = {}
		return {}

	if _CATEGORY_MAP_CACHE["map"] is not None and _CATEGORY_MAP_CACHE["mtime"] == mtime:
		return _CATEGORY_MAP_CACHE["map"]

	external_map = {}
	try:
		# Expanded dataset aliases can exceed Python's default CSV field limit.
		csv_limit = sys.maxsize
		while True:
			try:
				csv.field_size_limit(csv_limit)
				break
			except OverflowError:
				csv_limit = csv_limit // 10

		with open(MEDICINE_KEYWORD_MAP_PATH, "r", encoding="utf-8", newline="") as csv_file:
			reader = csv.DictReader(csv_file)
			for row in reader:
				category = normalize_medicine_category(row.get("category"))
				if not category:
					continue

				candidate_tokens = []
				for field_name in ("keyword", "medicine_name"):
					field_value = (row.get(field_name) or "").strip()
					if field_value:
						candidate_tokens.append(field_value)

				aliases = (row.get("aliases") or "").strip()
				if aliases:
					candidate_tokens.extend([token.strip() for token in re.split(r"[|,;]", aliases) if token.strip()])

				normalized_tokens = {
					normalize_medicine_text(token)
					for token in candidate_tokens
					if normalize_medicine_text(token)
				}
				if not normalized_tokens:
					continue

				external_map.setdefault(category, set()).update(normalized_tokens)
	except Exception as e:
		print(f"[CategoryMap] Failed to load keyword map CSV: {e}")
		external_map = {}

	_CATEGORY_MAP_CACHE["mtime"] = mtime
	_CATEGORY_MAP_CACHE["map"] = external_map
	return external_map


def get_combined_category_keyword_map():
	"""Merge built-in and external dataset keyword maps."""
	builtin_map = {
		"N02BE": {
			normalize_medicine_text(token)
			for token in ("paracetamol", "acetaminophen", "calpol", "crocin", "dolo", "dollo", "paracet")
		},
		"N02BA": {normalize_medicine_text(token) for token in ("aspirin", "acetylsalicylic")},
		"M01AE": {
			normalize_medicine_text(token)
			for token in ("ibuprofen", "naproxen", "ketoprofen")
		},
		"M01AB": {normalize_medicine_text(token) for token in ("diclofenac", "indomethacin", "aceclofenac")},
		"N05B": {normalize_medicine_text(token) for token in ("diazepam", "alprazolam", "lorazepam", "clonazepam")},
		"N05C": {normalize_medicine_text(token) for token in ("zolpidem", "zopiclone", "eszopiclone", "temazepam")},
		"R03": {
			normalize_medicine_text(token)
			for token in ("salbutamol", "albuterol", "montelukast", "budesonide", "theophylline")
		},
		"R06": {
			normalize_medicine_text(token)
			for token in ("cetirizine", "levocetirizine", "levocetrigen", "levo", "loratadine", "fexofenadine", "chlorpheniramine")
		},
	}

	external_map = load_external_category_keyword_map()
	combined = {k: set(v) for k, v in builtin_map.items()}
	for category, keywords in external_map.items():
		combined.setdefault(category, set()).update(keywords)

	# Clean empty tokens after merge.
	for category in list(combined.keys()):
		combined[category] = {token for token in combined[category] if token}

	return combined


def infer_medicine_category(medicine_name):
	"""
	Infer TFT series/category from a medicine name when admin does not provide one.
	This keeps demand-based stock predictions active for common medicines.
	"""
	raw_name = (medicine_name or "").strip()
	name = normalize_medicine_text(raw_name)
	if not name:
		return None

	combined_keyword_map = get_combined_category_keyword_map()

	# Exact and substring match first (high precision).
	for category_code, keywords in combined_keyword_map.items():
		for keyword in keywords:
			if name == keyword or keyword in name:
				return category_code

	# Token-level exact match.
	name_tokens = set(name.split())
	for category_code, keywords in combined_keyword_map.items():
		if any(keyword in name_tokens for keyword in keywords):
			return category_code

	# Typo-tolerant fallback using normalized similarity.
	best_match_category = None
	best_match_score = 0.0
	for category_code, keywords in combined_keyword_map.items():
		for keyword in keywords:
			score = SequenceMatcher(None, name, keyword).ratio()
			if score > best_match_score:
				best_match_score = score
				best_match_category = category_code

	if best_match_score >= 0.86:
		return best_match_category

	# Support direct entry where medicine name itself is a series code.
	direct_code = raw_name.upper()
	if direct_code in VALID_MEDICINE_CATEGORIES:
		return direct_code

	return None


def resolve_medicine_category(medicine_name, requested_category=None, existing_category=None):
	"""
	Determine the best category for a medicine.
	Priority: explicit category from request > existing stock category > inferred category.
	"""
	return (
		normalize_medicine_category(requested_category)
		or normalize_medicine_category(existing_category)
		or infer_medicine_category(medicine_name)
	)


def admin_required():
	if not current_user.is_authenticated or current_user.role != "admin":
		return False
	return True


@app.route("/")
def login():
	return render_template(
		"login.html",
		emailjs_public_key=os.environ.get("EMAILJS_PUBLIC_KEY", ""),
		emailjs_service_id=os.environ.get("EMAILJS_SERVICE_ID", ""),
		emailjs_template_id=os.environ.get("EMAILJS_TEMPLATE_ID", ""),
	)


@app.route("/healthz", methods=["GET"])
@app.route("/api/healthz", methods=["GET"])
def health_check():
	"""Lightweight runtime health check for deployment debugging."""
	db_ok = False
	db_error = None
	db_target = summarize_database_target(app.config.get("SQLALCHEMY_DATABASE_URI", ""))
	try:
		with db.engine.connect() as conn:
			conn.execute(text("SELECT 1"))
		db_ok = True
	except Exception as exc:
		db_error = str(exc)

	return jsonify({
		"success": True,
		"service": "mediassist",
		"status": "ok" if db_ok else "degraded",
		"environment": {
			"vercel": bool(os.environ.get("VERCEL")),
			"database_url_set": bool((os.environ.get("DATABASE_URL") or "").strip()),
			"secret_key_set": bool((os.environ.get("SECRET_KEY") or "").strip()),
		},
		"database": {
			"connected": db_ok,
			"target": db_target,
			"error": db_error,
		},
		"timestamp": datetime.utcnow().isoformat() + "Z",
	}), (200 if db_ok else 503)


@app.route("/admin/home")
@login_required
def admin_home():
	if not admin_required():
		return redirect(url_for("login"))
	return render_template("Admin/home.html")


@app.route("/admin/analytics")
@login_required
def admin_analytics():
	"""Serve the real-time inventory analytics page."""
	if not admin_required():
		return redirect(url_for("login"))
	return render_template("Admin/analytics.html")


@app.route("/admin/profile", methods=["GET"])
def get_admin_profile():
	# Check if user is authenticated
	if not current_user.is_authenticated:
		return jsonify({"success": False, "message": "Authentication required."}), 401
	
	if not admin_required():
		return jsonify({"success": False, "message": "Admin access required."}), 403

	admin_profile = current_user.admin_profile
	if not admin_profile:
		return jsonify({"success": False, "message": "Admin profile not found."}), 404

	return jsonify({
		"success": True,
		"admin": {
			"id": current_user.id,
			"fullName": admin_profile.full_name,
			"email": current_user.email,
			"phone": admin_profile.phone,
			"department": admin_profile.department,
			"adminRole": admin_profile.admin_role
		}
	})


@app.route("/admin/registration")
def admin_registration():
	return render_template("Admin/registration.html")


@app.route("/user/registration")
def user_registration():
	return render_template("User/registration.html")


@app.route("/user/home")
@login_required
def user_home():
	if current_user.role != "user":
		return redirect(url_for("login"))
	return render_template("User/home.html")


@app.route("/user/medical-reports")
@login_required
def user_medical_reports():
	if current_user.role != "user":
		return redirect(url_for("login"))
	return render_template("User/medical_reports.html")


@app.route("/user/health-monitoring")
@login_required
def user_health_monitoring():
	if current_user.role != "user":
		return redirect(url_for("login"))
	return render_template("User/health_monitoring.html")


@app.route("/api/user/prescriptions", methods=["GET"])
@login_required
def get_user_prescriptions():
	"""Get user's active prescriptions with enhanced dosage timing information."""
	if current_user.role != "user":
		return jsonify({"success": False, "message": "User access required."}), 403

	try:
		prescriptions = Prescription.query.filter_by(
			user_id=current_user.id,
			is_active=True
		).order_by(Prescription.start_date.desc()).all()

		prescription_list = []
		for prescription in prescriptions:
			effective_end_date = get_effective_prescription_end_date(prescription)
			dosage_info = format_dosage_display(prescription)
			progress = get_prescription_progress_status(prescription)
			display_med_name = canonicalize_medicine_name(prescription.medicine_name, use_dataset_fuzzy=False)
			dosage_info["times"] = progress["dose_times"]
			
			prescription_data = {
				"id": prescription.id,
				"medicine_name": display_med_name,
				"dosage_info": dosage_info,
				"prescribed_for": prescription.prescribed_for,
				"child_name": prescription.child_name,
				"child_age": prescription.child_age,
				"instructions": prescription.instructions,
				"start_date": prescription.start_date.strftime("%Y-%m-%d"),
				"end_date": effective_end_date.strftime("%Y-%m-%d") if effective_end_date else None,
				"quantity": prescription.quantity,
				"admin_name": prescription.admin.admin_profile.full_name if prescription.admin.admin_profile else "Doctor",
				"status": progress["status"],
				"doses_taken": progress["doses_taken"],
				"doses_total": progress["doses_total"],
				"doses_remaining": progress["doses_remaining"],
				"next_dose_text": progress["next_dose_text"],
				"next_dose_at": progress["next_dose_at"],
			}
			prescription_list.append(prescription_data)

		return jsonify({
			"success": True,
			"prescriptions": prescription_list
		})

	except Exception as e:
		print(f"[Prescriptions API Error] {e}")
		return jsonify({"success": False, "message": "Error fetching prescriptions."}), 500


@app.route("/api/analyze-symptoms", methods=["POST"])
@login_required
def analyze_symptoms():
	"""
	AI-powered symptom analysis endpoint.
	Accepts any symptom description and returns condition analysis with recommendations.
	"""
	if current_user.role != "user":
		return jsonify({"success": False, "message": "User access required."}), 403

	data = parse_request_data()
	symptoms_text = data.get("symptoms", "").strip()

	if not symptoms_text:
		return jsonify({"success": False, "message": "Please provide symptom description."}), 400

	try:
		# Comprehensive symptom-to-condition knowledge base
		conditions_db = {
			"fever": {
				"name": "Fever",
				"icon": "fas fa-temperature-high",
				"description": "Elevated body temperature caused by infection or inflammation.",
				"severity": 55,
				"severity_text": "Moderate",
				"keywords": ["fever", "high temperature", "chills", "sweating", "hot", "burning", "pyrexia"],
				"remedies": [
					{"title": "Ginger and honey tea", "desc": "Drink warm ginger tea 2-3 times daily."},
					{"title": "Hydration", "desc": "Take water, ORS, or clear soups throughout the day."},
					{"title": "Cold compress", "desc": "Apply a cool cloth to forehead and wrists."}
				],
				"activities": ["Complete bed rest", "Stay in a cool room", "Avoid heavy food"],
				"warnings": [
					"Fever above 103°F requires urgent medical care.",
					"Fever lasting more than 3 days should be evaluated.",
					"Fever with severe headache or stiff neck needs immediate review."
				]
			},
			"cold": {
				"name": "Common Cold",
				"icon": "fas fa-head-side-cough",
				"description": "Viral respiratory infection with nasal and throat symptoms.",
				"severity": 30,
				"severity_text": "Mild",
				"keywords": ["runny nose", "sneezing", "sore throat", "congestion", "stuffy", "cold", "cough"],
				"remedies": [
					{"title": "Steam inhalation", "desc": "Use steam for 10 minutes, 2-3 times daily."},
					{"title": "Saltwater gargle", "desc": "Gargle with warm saltwater to soothe throat."},
					{"title": "Vitamin C", "desc": "Use citrus fruits and warm fluids."}
				],
				"activities": ["Sleep 8+ hours", "Keep room ventilated", "Practice hand hygiene"],
				"warnings": [
					"Symptoms beyond 10 days may require consultation.",
					"High fever with cold symptoms needs clinical check.",
					"Breathing difficulty should be treated as urgent."
				]
			},
			"headache": {
				"name": "Headache",
				"icon": "fas fa-head-side-virus",
				"description": "Head pain linked to stress, dehydration, or migraine triggers.",
				"severity": 40,
				"severity_text": "Moderate",
				"keywords": ["headache", "head pain", "migraine", "throbbing", "pressure", "dizziness"],
				"remedies": [
					{"title": "Hydrate immediately", "desc": "Drink 2-3 glasses of water."},
					{"title": "Cold/warm compress", "desc": "Cold for migraine, warm for tension."},
					{"title": "Limit screen time", "desc": "Rest eyes in a dim environment."}
				],
				"activities": ["Rest in quiet room", "Gentle neck stretches", "Reduce screen exposure"],
				"warnings": [
					"Sudden severe headache requires emergency care.",
					"Headache after injury needs urgent evaluation.",
					"Persistent severe pain despite rest should be reviewed."
				]
			},
			"stomach": {
				"name": "Stomach Upset",
				"icon": "fas fa-stomach",
				"description": "Digestive discomfort such as nausea, gas, or bloating.",
				"severity": 35,
				"severity_text": "Mild to Moderate",
				"keywords": ["stomach", "nausea", "vomiting", "bloating", "indigestion", "gas", "acidity", "abdominal"],
				"remedies": [
					{"title": "Cumin seed water", "desc": "Warm jeera water helps gas and fullness."},
					{"title": "Bland food", "desc": "Choose light meals like banana and rice."},
					{"title": "Coconut water", "desc": "Maintains hydration and comfort."}
				],
				"activities": ["Take gentle walk", "Avoid spicy/oily meals", "Stay upright after meals"],
				"warnings": [
					"Severe abdominal pain for over 2 hours needs medical review.",
					"Blood in stool or vomit is an emergency sign.",
					"Persistent vomiting may cause dehydration."
				]
			},
			"cough": {
				"name": "Cough",
				"icon": "fas fa-lungs-virus",
				"description": "Dry or productive cough due to irritation or infection.",
				"severity": 35,
				"severity_text": "Mild",
				"keywords": ["cough", "dry cough", "wet cough", "chest", "mucus", "wheezing", "phlegm"],
				"remedies": [
					{"title": "Honey and ginger", "desc": "Use in small doses several times daily."},
					{"title": "Steam inhalation", "desc": "Helps loosen mucus and congestion."},
					{"title": "Warm turmeric milk", "desc": "Soothes irritated throat and chest."}
				],
				"activities": ["Rest and sleep well", "Avoid cold beverages", "Cover mouth while coughing"],
				"warnings": [
					"Cough lasting more than 3 weeks should be assessed.",
					"Coughing blood requires immediate emergency care.",
					"Cough with breathing difficulty is urgent."
				]
			},
			"body_pain": {
				"name": "Body Pain and Fatigue",
				"icon": "fas fa-bed",
				"description": "Generalized aches and tiredness from illness or stress.",
				"severity": 40,
				"severity_text": "Moderate",
				"keywords": ["body ache", "muscle pain", "fatigue", "tiredness", "weakness", "joint", "sore"],
				"remedies": [
					{"title": "Warm bath", "desc": "Helps relax sore muscles."},
					{"title": "Hydration and nutrition", "desc": "Support recovery with fluids."},
					{"title": "Light stretching", "desc": "Reduce stiffness without overexertion."}
				],
				"activities": ["Sleep 8-10 hours", "Avoid intensive workouts", "Gentle mobility only"],
				"warnings": [
					"Extreme weakness with shortness of breath needs urgent care.",
					"Persistent pain over one week needs evaluation.",
					"Chest pain with body pain is an emergency."
				]
			},
			"diarrhea": {
				"name": "Diarrhea",
				"icon": "fas fa-prescription-bottle-medical",
				"description": "Frequent loose stools linked to infection or food intolerance.",
				"severity": 50,
				"severity_text": "Moderate",
				"keywords": ["diarrhea", "loose motions", "loose stools", "watery", "food poisoning", "dysentery"],
				"remedies": [
					{"title": "ORS solution", "desc": "Drink after every loose motion."},
					{"title": "BRAT diet", "desc": "Banana, rice, applesauce, toast."},
					{"title": "Probiotic foods", "desc": "Curd may help gut recovery."}
				],
				"activities": ["Strict rest and hydration", "Avoid spicy/dairy meals", "Keep hand hygiene"],
				"warnings": [
					"More than 6 episodes in 24 hours requires review.",
					"Blood in stools is urgent.",
					"Dehydration signs need immediate medical attention."
				]
			},
			"flu": {
				"name": "Cold and Flu",
				"icon": "fas fa-virus",
				"description": "Flu-like syndrome with fever, cough, and body aches.",
				"severity": 60,
				"severity_text": "Moderate to High",
				"keywords": ["flu", "influenza", "cold and fever", "chills and cough", "viral"],
				"remedies": [
					{"title": "Warm herbal decoction", "desc": "Use ginger, basil, cinnamon in warm water."},
					{"title": "Frequent hydration", "desc": "Use soups and warm fluids often."},
					{"title": "Temperature monitoring", "desc": "Track fever and symptom progression."}
				],
				"activities": ["Complete bed rest", "Avoid crowded spaces", "Wear mask around others"],
				"warnings": [
					"Breathing difficulty needs emergency attention.",
					"Chest pain or confusion is urgent.",
					"Symptoms returning with high fever should be reviewed quickly."
				]
			},
			"allergy": {
				"name": "Allergic Reaction",
				"icon": "fas fa-allergies",
				"description": "Immune response to allergens causing various symptoms.",
				"severity": 35,
				"severity_text": "Mild to Moderate",
				"keywords": ["allergy", "allergic", "itching", "rash", "hives", "swelling", "sneezing"],
				"remedies": [
					{"title": "Antihistamine", "desc": "Take as directed by doctor."},
					{"title": "Cold compress", "desc": "Apply to affected areas for relief."},
					{"title": "Avoid triggers", "desc": "Identify and stay away from allergens."}
				],
				"activities": ["Keep environment clean", "Use air purifiers", "Avoid known allergens"],
				"warnings": [
					"Difficulty breathing or swallowing is an emergency.",
					"Severe swelling of face/throat needs immediate care.",
					"Persistent symptoms need medical evaluation."
				]
			},
			"anxiety": {
				"name": "Anxiety or Stress",
				"icon": "fas fa-brain",
				"description": "Mental health condition causing worry and physical symptoms.",
				"severity": 40,
				"severity_text": "Moderate",
				"keywords": ["anxiety", "stress", "panic", "worry", "nervous", "tension", "restless"],
				"remedies": [
					{"title": "Deep breathing", "desc": "Practice 4-7-8 breathing technique."},
					{"title": "Meditation", "desc": "10-15 minutes daily mindfulness."},
					{"title": "Herbal tea", "desc": "Chamomile or lavender tea for relaxation."}
				],
				"activities": ["Regular exercise", "Adequate sleep", "Talk to someone you trust"],
				"warnings": [
					"Persistent anxiety affecting daily life needs professional help.",
					"Suicidal thoughts require immediate emergency care.",
					"Physical symptoms with anxiety should be medically evaluated."
				]
			},
			"insomnia": {
				"name": "Insomnia or Sleep Issues",
				"icon": "fas fa-moon",
				"description": "Difficulty falling or staying asleep.",
				"severity": 35,
				"severity_text": "Mild to Moderate",
				"keywords": ["insomnia", "sleep", "sleepless", "can't sleep", "awake", "restless night"],
				"remedies": [
					{"title": "Sleep hygiene", "desc": "Maintain consistent sleep schedule."},
					{"title": "Warm milk", "desc": "Drink before bedtime."},
					{"title": "Relaxation techniques", "desc": "Progressive muscle relaxation."}
				],
				"activities": ["Avoid screens before bed", "Create dark, cool environment", "Limit caffeine"],
				"warnings": [
					"Chronic insomnia lasting weeks needs medical evaluation.",
					"Sleep issues with depression need professional help.",
					"Excessive daytime sleepiness should be assessed."
				]
			},
			"back_pain": {
				"name": "Back Pain",
				"icon": "fas fa-user-injured",
				"description": "Pain in the back area from strain or injury.",
				"severity": 45,
				"severity_text": "Moderate",
				"keywords": ["back pain", "backache", "spine", "lower back", "upper back", "lumbar"],
				"remedies": [
					{"title": "Hot/cold therapy", "desc": "Alternate between hot and cold packs."},
					{"title": "Gentle stretching", "desc": "Yoga poses for back relief."},
					{"title": "Pain relief cream", "desc": "Apply topical analgesic."}
				],
				"activities": ["Maintain good posture", "Avoid heavy lifting", "Sleep on firm mattress"],
				"warnings": [
					"Severe pain with numbness needs immediate evaluation.",
					"Back pain after injury requires medical check.",
					"Pain lasting more than 2 weeks should be assessed."
				]
			},
			"skin_rash": {
				"name": "Skin Rash or Irritation",
				"icon": "fas fa-hand-dots",
				"description": "Skin inflammation causing redness and discomfort.",
				"severity": 30,
				"severity_text": "Mild",
				"keywords": ["rash", "skin", "itchy", "red", "irritation", "eczema", "dermatitis"],
				"remedies": [
					{"title": "Moisturizer", "desc": "Apply fragrance-free lotion."},
					{"title": "Oatmeal bath", "desc": "Soak in colloidal oatmeal."},
					{"title": "Avoid scratching", "desc": "Keep nails short and clean."}
				],
				"activities": ["Wear loose clothing", "Use mild soap", "Avoid hot showers"],
				"warnings": [
					"Spreading rash with fever needs medical attention.",
					"Severe itching affecting sleep should be evaluated.",
					"Rash with blisters or pus requires medical care."
				]
			}
		}

		# Normalize input
		symptoms_lower = symptoms_text.lower()
		
		# Score each condition based on keyword matches
		scored_conditions = []
		for condition_key, condition in conditions_db.items():
			score = 0
			matched_keywords = []
			
			for keyword in condition["keywords"]:
				if keyword in symptoms_lower:
					score += 1
					matched_keywords.append(keyword)
			
			if score > 0:
				scored_conditions.append({
					"condition": condition,
					"score": score,
					"matched_keywords": matched_keywords
				})
		
		# Sort by score (highest first)
		scored_conditions.sort(key=lambda x: x["score"], reverse=True)
		
		if not scored_conditions:
			# No match found - provide general health advice
			return jsonify({
				"success": True,
				"condition": {
					"name": "General Health Concern",
					"icon": "fas fa-notes-medical",
					"description": "Your symptoms don't match our common conditions database. Please consult a healthcare professional for accurate diagnosis.",
					"severity": 50,
					"severity_text": "Unknown",
					"remedies": [
						{"title": "Stay hydrated", "desc": "Drink plenty of water throughout the day."},
						{"title": "Rest adequately", "desc": "Get 7-8 hours of sleep."},
						{"title": "Monitor symptoms", "desc": "Keep track of any changes."}
					],
					"activities": ["Maintain balanced diet", "Light exercise if possible", "Avoid self-medication"],
					"warnings": [
						"Consult a doctor for proper diagnosis.",
						"Seek immediate care if symptoms worsen.",
						"Don't ignore persistent or severe symptoms."
					]
				},
				"matched_symptoms": [],
				"confidence": "low"
			})
		
		# Return best match
		best_match = scored_conditions[0]
		return jsonify({
			"success": True,
			"condition": best_match["condition"],
			"matched_symptoms": best_match["matched_keywords"],
			"confidence": "high" if best_match["score"] >= 3 else "medium"
		})

	except Exception as e:
		print(f"[Symptom Analysis Error] {e}")
		return jsonify({"success": False, "message": "Error analyzing symptoms. Please try again."}), 500


@app.route("/user/profile", methods=["GET"])
@login_required
def get_user_profile():
	if current_user.role != "user":
		return jsonify({"success": False, "message": "User access required."}), 403

	profile = current_user.user_profile
	if not profile:
		return jsonify({"success": False, "message": "User profile not found."}), 404

	return jsonify({
		"success": True,
		"user": {
			"id": current_user.id,
			"email": current_user.email,
			"mobile": current_user.mobile,
			"fullName": profile.full_name,
			"userCode": profile.user_code,
			"gender": profile.gender,
			"mustChangePassword": current_user.must_change_password
		}
	})


@app.route("/user/profile", methods=["PUT", "POST"])
@login_required
def update_user_profile():
	if current_user.role != "user":
		return jsonify({"success": False, "message": "User access required."}), 403

	profile = current_user.user_profile
	if not profile:
		return jsonify({"success": False, "message": "User profile not found."}), 404

	data = parse_request_data()

	full_name = (data.get("fullName") or profile.full_name or "").strip()
	gender = (data.get("gender") or profile.gender or "").strip()
	email_raw = data.get("email")
	mobile_raw = data.get("mobile")

	if not full_name:
		return jsonify({"success": False, "message": "Full name is required."}), 400

	if len(full_name) < 2:
		return jsonify({"success": False, "message": "Full name must be at least 2 characters."}), 400

	if gender and gender.lower() not in {"male", "female", "other"}:
		return jsonify({"success": False, "message": "Invalid gender selected."}), 400

	email = None
	if email_raw is not None:
		email = (email_raw or "").strip().lower() or None
	else:
		email = current_user.email

	mobile = current_user.mobile
	if mobile_raw is not None:
		mobile = (mobile_raw or "").strip()
		mobile = mobile.replace("-", "").replace(" ", "").replace("(", "").replace(")", "")
		if not mobile:
			return jsonify({"success": False, "message": "Mobile number is required."}), 400

	if email:
		existing_email_user = User.query.filter(
			sa_func.lower(User.email) == email,
			User.id != current_user.id
		).first()
		if existing_email_user:
			return jsonify({"success": False, "message": "Email already registered."}), 400

	if mobile:
		existing_mobile_user = User.query.filter(
			User.mobile == mobile,
			User.id != current_user.id
		).first()
		if existing_mobile_user:
			return jsonify({"success": False, "message": "Mobile already registered."}), 400

	profile.full_name = full_name
	profile.gender = gender or None
	current_user.email = email
	current_user.mobile = mobile

	db.session.commit()

	return jsonify({
		"success": True,
		"message": "Profile updated successfully.",
		"user": {
			"id": current_user.id,
			"email": current_user.email,
			"mobile": current_user.mobile,
			"fullName": profile.full_name,
			"userCode": profile.user_code,
			"gender": profile.gender,
			"mustChangePassword": current_user.must_change_password
		}
	})


@app.route("/user/delete-account", methods=["POST", "DELETE"])
@login_required
def delete_user_account():
	if current_user.role != "user":
		return jsonify({"success": False, "message": "User access required."}), 403

	try:
		user = current_user._get_current_object()
		profile = getattr(user, "user_profile", None)
		user_code = profile.user_code if profile else None

		PasswordResetToken.query.filter_by(user_id=user.id).delete(synchronize_session=False)
		LoginOtpToken.query.filter_by(user_id=user.id).delete(synchronize_session=False)

		if user_code:
			purchases = Purchase.query.filter_by(user_code=user_code).all()
			for purchase in purchases:
				db.session.delete(purchase)

		if profile:
			db.session.delete(profile)

		logout_user()
		db.session.delete(user)
		db.session.commit()

		return jsonify({
			"success": True,
			"message": "Account deleted successfully.",
			"redirectUrl": url_for("login")
		})

	except Exception as e:
		db.session.rollback()
		print(f"[DeleteAccount Error] {e}")
		return jsonify({"success": False, "message": "Could not delete account."}), 500


@app.route("/user/medicine-alerts", methods=["GET"])
@login_required
def get_user_medicine_alerts():
	if current_user.role != "user":
		return jsonify({"success": False, "message": "User access required."}), 403

	try:
		today = date.today()
		alerts = []

		prescriptions = Prescription.query.filter_by(user_id=current_user.id, is_active=True).all()

		for prescription in prescriptions:
			med_name = canonicalize_medicine_name(prescription.medicine_name, use_dataset_fuzzy=False)

			# Prescription expiry / refill alerts
			if prescription.end_date:
				if prescription.end_date < today:
					alerts.append({
						"type": "PRESCRIPTION_EXPIRED",
						"severity": "HIGH",
						"medicine": med_name,
						"message": f"Your prescription for {med_name} has expired. Please consult your doctor for a renewal.",
						"icon": "fas fa-file-medical-alt",
						"color": "#d9534f"
					})
				elif (prescription.end_date - today).days <= 7:
					days_left = (prescription.end_date - today).days
					alerts.append({
						"type": "REFILL_DUE",
						"severity": "MEDIUM",
						"medicine": med_name,
						"message": f"Prescription for {med_name} expires in {days_left} day(s). Contact your doctor for a refill.",
						"icon": "fas fa-calendar-times",
						"color": "#f0ad4e"
					})

			# Dose reminder for active medicines
			if prescription.dosage:
				dosage_text = prescription.dosage
				message = f"Reminder: Take {med_name} — {dosage_text}."
				if prescription.instructions:
					message += f" {prescription.instructions}"
				alerts.append({
					"type": "DOSE_REMINDER",
					"severity": "LOW",
					"medicine": med_name,
					"message": message,
					"icon": "fas fa-capsules",
					"color": "#17a2b8"
				})

		# Medicine item expiry alerts (from medicines the user bought at the pharmacy)
		profile = getattr(current_user, 'user_profile', None)
		if profile and profile.user_code:
			purchases = Purchase.query.filter_by(user_code=profile.user_code).all()
			for purchase in purchases:
				for item in purchase.items:
					if not item.expiry_date:
						continue
					item_display_name = canonicalize_medicine_name(item.name, use_dataset_fuzzy=False)
					days_to_exp = (item.expiry_date - today).days
					if days_to_exp <= 0:
						alerts.append({
							"type": "MEDICINE_EXPIRED",
							"severity": "HIGH",
							"medicine": item_display_name,
							"message": f"Your medicine {item_display_name} has expired. Please discard it and consult your doctor for a replacement.",
							"icon": "fas fa-ban",
							"color": "#d9534f"
						})
					elif days_to_exp <= 30:
						alerts.append({
							"type": "MEDICINE_EXPIRY_SOON",
							"severity": "MEDIUM",
							"medicine": item_display_name,
							"message": f"Your medicine {item_display_name} will expire in {days_to_exp} day(s) (on {item.expiry_date.strftime('%b %d, %Y')}). Arrange a replacement soon.",
							"icon": "fas fa-hourglass-half",
							"color": "#f0ad4e"
						})

		severity_order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
		alerts.sort(key=lambda a: severity_order.get(a["severity"], 99))

		return jsonify({"success": True, "alerts": alerts, "count": len(alerts)})

	except Exception as e:
		import traceback
		print(f"[UserAlerts Error] {e}")
		traceback.print_exc()
		return jsonify({"success": False, "message": "Error fetching alerts."}), 500


@app.route("/admin/search-user", methods=["POST"])
@login_required
def search_user_by_mobile():
	if not admin_required():
		return jsonify({"success": False, "message": "Admin access required."}), 403

	data = parse_request_data()
	mobile = (data.get("mobile") or "").strip().replace("-", "").replace(" ", "").replace("(", "").replace(")", "")

	if not mobile:
		return jsonify({"success": False, "message": "Mobile number required."}), 400

	user = User.query.filter_by(mobile=mobile, role="user").first()

	if user:
		profile = user.user_profile
		if profile:
			return jsonify({
				"success": True,
				"exists": True,
				"userId": profile.user_code,
				"fullName": profile.full_name,
				"email": user.email,
				"mobile": user.mobile,
				"gender": profile.gender
			})
		return jsonify({"success": True, "exists": False})

	return jsonify({"success": True, "exists": False})


@app.route("/auth/logout")
def logout():
	if current_user.is_authenticated:
		logout_user()
	return redirect(url_for("login"))


@app.route("/auth/register/user", methods=["POST"])
def register_user():
	data = parse_request_data()
	name = (data.get("userName") or "").strip()
	email = (data.get("email") or "").strip() or None
	mobile = (data.get("mobileNumber") or "").strip().replace("-", "").replace(" ", "").replace("(", "").replace(")", "")
	gender = (data.get("gender") or "").strip() or None
	password = (data.get("password") or "").strip()

	if not name or not mobile:
		return jsonify({"success": False, "message": "Name and mobile are required."}), 400

	if email and User.query.filter_by(email=email).first():
		return jsonify({"success": False, "message": "Email already registered."}), 400
	if User.query.filter_by(mobile=mobile).first():
		return jsonify({"success": False, "message": "Mobile already registered."}), 400

	user = User(role="user", email=email, mobile=mobile)
	if password:
		user.password_hash = generate_password_hash(password)

	user_code = generate_user_code()
	profile = UserProfile(full_name=name, gender=gender, user_code=user_code)
	user.user_profile = profile

	db.session.add(user)
	db.session.commit()

	return jsonify({"success": True, "userId": user_code})


@app.route("/auth/register/admin", methods=["POST"])
def register_admin():
	data = parse_request_data()
	full_name = (data.get("fullName") or "").strip()
	email = (data.get("email") or "").strip()
	phone = (data.get("phone") or "").strip()
	dob = (data.get("dob") or "").strip()
	gender = (data.get("gender") or "").strip()
	address = (data.get("address") or "").strip()
	hospital_name = (data.get("hospitalName") or "").strip()
	hospital_type = (data.get("hospitalType") or "").strip()
	hospital_address = (data.get("hospitalAddress") or "").strip()
	hospital_contact = (data.get("hospitalContact") or "").strip()
	license_number = (data.get("licenseNumber") or "").strip()
	admin_role = (data.get("adminRole") or "").strip()
	department = (data.get("department") or "").strip()
	employee_id = (data.get("employeeId") or "").strip() or None
	admin_notes = (data.get("adminNotes") or "").strip() or None
	password = (data.get("password") or "").strip()

	permissions = data.get("permissions")
	if isinstance(permissions, str):
		permissions = [p for p in permissions.split(",") if p]
	if permissions is None:
		permissions = []

	if not all([full_name, email, phone, dob, gender, address, hospital_name, hospital_type, hospital_address, hospital_contact, license_number, admin_role, department, password]):
		return jsonify({"success": False, "message": "All required fields must be filled."}), 400

	if User.query.filter_by(email=email).first():
		return jsonify({"success": False, "message": "Email already registered."}), 400
	if User.query.filter_by(mobile=phone).first():
		return jsonify({"success": False, "message": "Phone number already registered."}), 400

	try:
		dob_date = datetime.strptime(dob, "%Y-%m-%d").date()
	except ValueError:
		return jsonify({"success": False, "message": "Invalid date of birth."}), 400

	hospital = Hospital(
		name=hospital_name,
		hospital_type=hospital_type,
		address=hospital_address,
		contact=hospital_contact,
		license_number=license_number,
	)
	user = User(role="admin", email=email, mobile=phone, password_hash=generate_password_hash(password))
	admin_profile = AdminProfile(
		full_name=full_name,
		phone=phone,
		dob=dob_date,
		gender=gender,
		address=address,
		admin_role=admin_role,
		department=department,
		permissions=permissions,
		employee_id=employee_id,
		admin_notes=admin_notes,
	)

	admin_profile.user = user
	admin_profile.hospital = hospital

	db.session.add(user)
	db.session.commit()

	return jsonify({"success": True})


@app.route("/auth/login/mobile-status", methods=["POST"])
def login_mobile_status():
	"""Return user classification for login popup hints."""
	data = parse_request_data()
	mobile = (data.get("mobile") or "").strip().replace("-", "").replace(" ", "").replace("(", "").replace(")", "")

	if not mobile:
		return jsonify({"success": False, "message": "Mobile number is required."}), 400

	user = User.query.filter_by(mobile=mobile, role="user").first()
	if not user:
		return jsonify({
			"success": True,
			"status": "unregistered",
			"message": "This number is not registered. Please register first."
		})

	is_new_user = bool(user.must_change_password) or not bool(user.password_hash)
	if is_new_user:
		return jsonify({
			"success": True,
			"status": "new",
			"message": "New user detected. Enter your mobile number as password."
		})

	return jsonify({
		"success": True,
		"status": "existing",
		"message": "Existing user detected. Enter your password."
	})


@app.route("/auth/login", methods=["POST"])
def auth_login():
	data = parse_request_data()
	user_type = (data.get("userType") or "").strip()
	email = (data.get("email") or "").strip()
	mobile = (data.get("mobile") or "").strip().replace("-", "").replace(" ", "").replace("(", "").replace(")", "")
	method = (data.get("method") or "").strip()
	password = (data.get("password") or "").strip()
	otp = (data.get("otp") or "").strip()

	if user_type == "admin":
		if not email or not password:
			return jsonify({"success": False, "message": "Email and password required."}), 400
		user = User.query.filter_by(email=email, role="admin").first()
		if not user or not user.password_hash or not check_password_hash(user.password_hash, password):
			return jsonify({"success": False, "message": "Invalid admin credentials."}), 401
		login_user(user)
		return jsonify({"success": True, "redirect": "/admin/home"})

	if not mobile:
		return jsonify({"success": False, "message": "Mobile number is required."}), 400

	user = User.query.filter_by(mobile=mobile, role="user").first()
	if not user:
		return jsonify({"success": False, "message": "User not found."}), 404

	if method == "password":
		if not user.password_hash or not password:
			return jsonify({"success": False, "message": "Password login not available for this user."}), 400
		if not check_password_hash(user.password_hash, password):
			return jsonify({"success": False, "message": "Invalid password."}), 401
	elif method == "otp":
		if not otp or not otp.isdigit():
			return jsonify({"success": False, "message": "Invalid OTP."}), 400
		# Verify against stored login OTP token
		token_record = (
			LoginOtpToken.query
			.filter_by(user_id=user.id, otp=otp, is_used=False)
			.order_by(LoginOtpToken.created_at.desc())
			.first()
		)
		if not token_record:
			return jsonify({"success": False, "message": "Invalid OTP. Please request a new one."}), 401
		if token_record.expires_at < datetime.utcnow():
			return jsonify({"success": False, "message": "OTP has expired. Please request a new one."}), 401
		token_record.is_used = True
		db.session.commit()
	else:
		return jsonify({"success": False, "message": "Select an authentication method."}), 400

	login_user(user)
	return jsonify({"success": True, "redirect": "/user/home"})


@app.route("/auth/login/send-otp", methods=["POST"])
def login_send_otp():
	"""Send a 6-digit OTP to the user's registered mobile for sign-in."""
	data = parse_request_data()
	mobile = (data.get("mobile") or "").strip().replace("-", "").replace(" ", "").replace("(", "").replace(")", "")

	if not mobile:
		return jsonify({"success": False, "message": "Mobile number is required."}), 400

	user = User.query.filter_by(mobile=mobile, role="user").first()
	if not user:
		# Anti-enumeration: always return success
		return jsonify({"success": True, "message": "If this number is registered, an OTP has been sent."})

	# Invalidate any old unused login OTPs for this user
	LoginOtpToken.query.filter_by(user_id=user.id, is_used=False).update({"is_used": True})
	db.session.flush()

	otp = str(random.randint(100000, 999999))
	expires_at = datetime.utcnow() + timedelta(minutes=10)

	token_record = LoginOtpToken(
		user_id=user.id,
		mobile=mobile,
		otp=otp,
		expires_at=expires_at,
	)
	db.session.add(token_record)
	db.session.commit()

	try:
		real_sent = send_reset_sms(
			mobile,
			otp,
			message=(
				f"MediAssist: Your sign-in OTP is {otp}. "
				f"Valid for 10 minutes. Use this to log in to your account. Do not share this OTP."
			),
		)
	except RuntimeError as err:
		return jsonify({"success": False, "message": f"Failed to send OTP: {err}"}), 500

	return jsonify({"success": True, "message": "OTP sent to your registered mobile number."})


# ─── Password Reset ──────────────────────────────────────────────────────────

@app.route("/auth/forgot-password/request", methods=["POST"])
def forgot_password_request():
	"""Step 1 — validate identity & send a 6-digit OTP via email or SMS."""
	data = parse_request_data()
	role       = (data.get("role")       or "").strip()   # 'user' | 'admin'
	method     = (data.get("method")     or "").strip()   # 'email' | 'mobile'
	identifier = (data.get("identifier") or "").strip()

	if role not in ("user", "admin") or method not in ("email", "mobile") or not identifier:
		return jsonify({"success": False, "message": "Invalid request. All fields required."}), 400

	# Normalise mobile (strip formatting)
	if method == "mobile":
		identifier = identifier.replace("-", "").replace(" ", "").replace("(", "").replace(")", "")

	# Normalise email to lowercase for case-insensitive lookup
	if method == "email":
		identifier = identifier.lower()

	# Look-up user — return generic success even when not found (anti-enumeration)
	if method == "email":
		user = User.query.filter(
			sa_func.lower(User.email) == identifier,
			User.role == role
		).first()
	else:
		user = User.query.filter_by(mobile=identifier, role=role).first()

	if not user:
		return jsonify({"success": False, "message": "No account found with the provided details."}), 404

	# Invalidate any existing unused tokens for this user
	PasswordResetToken.query.filter_by(user_id=user.id, is_used=False).update({"is_used": True})
	db.session.flush()

	# Generate a new 6-digit OTP
	otp = str(random.randint(100000, 999999))
	expires_at = datetime.utcnow() + timedelta(minutes=10)

	token_record = PasswordResetToken(
		user_id=user.id,
		otp=otp,
		method=method,
		identifier=identifier,
		expires_at=expires_at,
	)
	db.session.add(token_record)
	db.session.commit()

	emailjs_public_key = (os.environ.get("EMAILJS_PUBLIC_KEY") or "").strip()
	emailjs_service_id = (os.environ.get("EMAILJS_SERVICE_ID") or "").strip()
	emailjs_template_id = (os.environ.get("EMAILJS_TEMPLATE_ID") or "").strip()

	# Email reset can be delivered client-side through EmailJS when configured.
	try:
		if method == "email":
			if emailjs_public_key and emailjs_service_id and emailjs_template_id:
				return jsonify({
					"success": True,
					"message": "OTP generated. Sending email...",
					"emailjs_enabled": True,
					"email_otp": otp,
					"email_role_label": "Admin" if role == "admin" else "User",
				})
			send_reset_email(identifier, otp)
		else:
			send_reset_sms(identifier, otp)
	except RuntimeError as delivery_err:
		return jsonify({
			"success": False,
			"message": f"Failed to send OTP: {delivery_err}"
		}), 500

	return jsonify({"success": True, "message": f"OTP sent to your {method}."})


@app.route("/auth/forgot-password/validate-otp", methods=["POST"])
def forgot_password_validate_otp():
	"""Step 2 — validate OTP only. Does NOT change the password or consume the token."""
	data = parse_request_data()
	role       = (data.get("role")       or "").strip()
	method     = (data.get("method")     or "").strip()
	identifier = (data.get("identifier") or "").strip()
	otp        = (data.get("otp")        or "").strip()

	if not all([role, method, identifier, otp]):
		return jsonify({"success": False, "message": "All fields are required."}), 400

	if method == "mobile":
		identifier = identifier.replace("-", "").replace(" ", "").replace("(", "").replace(")", "")

	# Normalise email to lowercase for case-insensitive lookup
	if method == "email":
		identifier = identifier.lower()

	if method == "email":
		user = User.query.filter(
			sa_func.lower(User.email) == identifier,
			User.role == role
		).first()
	else:
		user = User.query.filter_by(mobile=identifier, role=role).first()

	if not user:
		return jsonify({"success": False, "message": "Account not found."}), 404

	token_record = (
		PasswordResetToken.query
		.filter_by(user_id=user.id, otp=otp, method=method, is_used=False)
		.order_by(PasswordResetToken.created_at.desc())
		.first()
	)

	if not token_record:
		return jsonify({"success": False, "message": "Invalid OTP. Please check and try again."}), 400

	if token_record.expires_at < datetime.utcnow():
		return jsonify({"success": False, "message": "OTP has expired. Please request a new one."}), 400

	return jsonify({"success": True, "message": "OTP verified successfully."})


@app.route("/auth/forgot-password/verify", methods=["POST"])
def forgot_password_verify():
	"""Step 2 — verify OTP and set the new password in one request."""
	data = parse_request_data()
	role         = (data.get("role")        or "").strip()
	method       = (data.get("method")      or "").strip()
	identifier   = (data.get("identifier")  or "").strip()
	otp          = (data.get("otp")         or "").strip()
	new_password = (data.get("newPassword") or "").strip()

	if not all([role, method, identifier, otp, new_password]):
		return jsonify({"success": False, "message": "All fields are required."}), 400

	if method == "mobile":
		identifier = identifier.replace("-", "").replace(" ", "").replace("(", "").replace(")", "")

	# Normalise email to lowercase for case-insensitive lookup
	if method == "email":
		identifier = identifier.lower()

	# Locate user
	if method == "email":
		user = User.query.filter(
			sa_func.lower(User.email) == identifier,
			User.role == role
		).first()
	else:
		user = User.query.filter_by(mobile=identifier, role=role).first()

	if not user:
		return jsonify({"success": False, "message": "Account not found."}), 404

	if len(new_password) < 6:
		return jsonify({"success": False, "message": "Password must be at least 6 characters."}), 400

	# Verify OTP — must match the most recent unused token for this user
	token_record = (
		PasswordResetToken.query
		.filter_by(user_id=user.id, otp=otp, method=method, is_used=False)
		.order_by(PasswordResetToken.created_at.desc())
		.first()
	)

	if not token_record:
		return jsonify({"success": False, "message": "Invalid OTP. Please request a new one."}), 400

	if token_record.expires_at < datetime.utcnow():
		return jsonify({"success": False, "message": "OTP has expired. Please request a new one."}), 400

	# All good — update password and mark token used
	user.set_password(new_password)
	token_record.is_used = True
	db.session.commit()

	return jsonify({"success": True, "message": "Password reset successfully. You can now sign in."})


@app.route("/admin/purchases", methods=["POST"])
@login_required
def create_purchase():
	if not admin_required():
		return jsonify({"success": False, "message": "Admin access required."}), 403

	try:
		data = parse_request_data()
		medicines = data.get("medicines") or []
		if isinstance(medicines, str):
			medicines = []

		try:
			grand_total = float(data.get("grandTotal", 0)) if data.get("grandTotal") is not None else None
		except ValueError:
			grand_total = None

		# Extract user details for auto-creation
		user_contact = (data.get("userContact") or "").strip().replace("-", "").replace(" ", "").replace("(", "").replace(")", "")
		user_email = (data.get("userEmail") or "").strip() or None
		user_full_name = (data.get("userFullName") or "").strip()
		user_code = (data.get("userId") or "").strip() or None

		# Check if user exists by mobile or email
		user = None
		if user_contact:
			user = User.query.filter_by(mobile=user_contact, role="user").first()
		if not user and user_email:
			user = User.query.filter_by(email=user_email, role="user").first()

		# Auto-create user if doesn't exist
		if not user and (user_contact or user_email):
			if user_contact and User.query.filter_by(mobile=user_contact).first():
				return jsonify({"success": False, "message": "Mobile already registered with different account."}), 400
			if user_email and User.query.filter_by(email=user_email).first():
				return jsonify({"success": False, "message": "Email already registered with different account."}), 400

			# Create new user with password set to mobile number
			user = User(role="user", email=user_email, mobile=user_contact if user_contact else None, must_change_password=True)
			user.set_password(user_contact)  # Set password to mobile number
			db.session.add(user)
			db.session.flush()

			# Create user profile
			generated_user_code = user_code or generate_user_code()
			profile = UserProfile(
				user_id=user.id,
				full_name=user_full_name or "Patient",
				gender=data.get("purchaserGender"),
				user_code=generated_user_code
			)
			db.session.add(profile)
			db.session.flush()
			user_code = generated_user_code
		elif user and user_full_name:
			# User exists - update profile name if a name was provided
			profile = UserProfile.query.filter_by(user_id=user.id).first()
			if profile and user_full_name.strip():
				profile.full_name = user_full_name.strip()
				db.session.flush()

		if not user:
			return jsonify({"success": False, "message": "User contact or email is required to create or find user."}), 400

		# Create purchase record
		purchase = Purchase(
			admin_id=current_user.id,
			purchase_for=data.get("purchaseFor"),
			child_name=data.get("childName"),
			child_age=int(data.get("childAge")) if data.get("childAge") else None,
			child_gender=data.get("childGender"),
			purchaser_gender=data.get("purchaserGender"),
			purchaser_age=int(data.get("purchaserAge")) if data.get("purchaserAge") else None,
			payment_method=data.get("paymentMethod"),
			grand_total=grand_total,
			user_code=user_code or user.user_profile.user_code if hasattr(user, 'user_profile') else None,
			user_full_name=user_full_name,
			user_contact=user_contact,
			user_email=user_email,
		)
		db.session.add(purchase)
		db.session.flush()

		# Create medicine items and prescriptions
		for item in medicines:
			canonical_med_name = canonicalize_medicine_name(item.get("name") or "")
			try:
				qty = int(item.get("quantity", 0))
			except ValueError:
				qty = 0
			try:
				unit_price = float(item.get("unitPrice", 0))
			except ValueError:
				unit_price = 0
			try:
				total = float(item.get("total", 0))
			except ValueError:
				total = 0

			purchase_date = None
			expiry_date = None
			if item.get("purchaseDate"):
				try:
					purchase_date = datetime.strptime(item.get("purchaseDate"), "%Y-%m-%d").date()
				except ValueError:
					purchase_date = None
			if item.get("expiryDate"):
				try:
					expiry_date = datetime.strptime(item.get("expiryDate"), "%Y-%m-%d").date()
				except ValueError:
					expiry_date = None

			medicine = MedicineItem(
				purchase=purchase,
				name=canonical_med_name,
				quantity=qty,
				unit_price=unit_price,
				total=total,
				purchase_date=purchase_date,
				expiry_date=expiry_date,
				dosage=item.get("dosage"),
				custom_dosage=item.get("customDosage"),
			)
			db.session.add(medicine)

			# Create prescription for the user with enhanced dosage timing
			# Make new fields optional with safe defaults
			frequency = 1
			timing = "AF"
			dosage_amount = None
			specific_times = None
			
			# Safely extract new dosage fields if they exist
			if isinstance(item, dict):
				try:
					frequency = int(item.get("frequency", 1)) if item.get("frequency") else 1
				except (ValueError, TypeError):
					frequency = 1
				
				timing = item.get("timing", "AF") or "AF"
				dosage_amount = item.get("dosageAmount") or None
				
				# Handle specific times
				times = item.get("specificTimes")
				if times and isinstance(times, list) and len(times) > 0:
					specific_times = sanitize_dose_times(times)

			if not specific_times:
				specific_times = get_default_dose_times(frequency)
			
			prescription = Prescription(
				user_id=user.id,
				admin_id=current_user.id,
				purchase_id=purchase.id,
				medicine_name=canonical_med_name,
				dosage=item.get("dosage") or item.get("customDosage"),
				quantity=qty,
				instructions=item.get("instructions") or f"Take {item.get('dosage', 'as prescribed')}",
				prescribed_for=data.get("purchaseFor"),
				child_name=data.get("childName"),
				child_age=int(data.get("childAge")) if data.get("childAge") else None,
				end_date=expiry_date,
				# Enhanced dosage timing fields with safe defaults
				frequency_per_day=frequency,
				timing_relation=timing,
				dosage_amount=dosage_amount,
				specific_times=specific_times
			)
			db.session.add(prescription)

		# ═══════════════════════════════════════════════════════════════
		#  EVENT-DRIVEN REAL-TIME AUTOMATION — ATOMIC TRANSACTION
		# ───────────────────────────────────────────────────────────────
		#  CRITICAL DESIGN: The stock decrement happens in the SAME
		#  transaction as the purchase creation.  This guarantees that
		#  either BOTH succeed or BOTH roll back — no orphaned purchases
		#  without matching stock decrements.
		#
		#  SEQUENCE (all within a single db.session.commit()):
		#    1. Purchase, MedicineItems, Prescriptions are staged above.
		#    2. Loop below decrements MedicineStock.current_stock for each
		#       medicine sold.  If the medicine has no stock record yet,
		#       one is auto-created with stock = 0.
		#    3. db.session.commit() persists everything atomically.
		#    4. AFTER the commit, trigger_inventory_analysis() runs the
		#       rule engine for JUST that medicine (efficient & targeted).
		#    5. The rule engine checks: is stock ≤ reorder_level?  Is the
		#       medicine expiring soon?  Does projected demand exceed stock?
		#    6. Alerts are upserted into the realtime_alerts table.
		#    7. The Product Analysis page, on its next data fetch, reads
		#       these alerts from the same table → always shows fresh state.
		#
		#  WHY SYNCHRONOUS (not async/queued):
		#    • Simpler to reason about — no eventual consistency issues.
		#    • The rule engine is fast (< 50ms per medicine).
		#    • Alerts are guaranteed to exist before the HTTP response.
		# ═══════════════════════════════════════════════════════════════
		medicines_updated = []
		for item in medicines:
			med_name = canonicalize_medicine_name(item.get("name") or "")
			if not med_name:
				continue
			item_category = normalize_medicine_category(item.get("category"))
			try:
				qty_sold = int(item.get("quantity", 0))
			except (ValueError, TypeError):
				qty_sold = 0

			# ── CASE-INSENSITIVE LOOKUP ──────────────────────────────
			# Medicine names may arrive in any casing from the frontend
			# (e.g. "paracetamol", "Paracetamol", "PARACETAMOL").
			# Using PostgreSQL LOWER() ensures all variants match the
			# same stock record, preventing duplicate entries.
			stock_record = MedicineStock.query.filter(
				sa_func.lower(MedicineStock.medicine_name) == med_name.lower()
			).first()
			if stock_record:
				resolved_category = resolve_medicine_category(
					med_name,
					item_category,
					stock_record.category,
				)
				if resolved_category:
					stock_record.category = resolved_category
				# Decrement stock (floor at 0 — can't go negative)
				prev_stock = int(stock_record.current_stock or 0)
				stock_record.current_stock = max(0, prev_stock - qty_sold)
				actual_delta = int(stock_record.current_stock or 0) - prev_stock
				stock_record.last_sold = datetime.utcnow()
				if actual_delta < 0:
					db.session.add(StockMovement(
						medicine_name=med_name,
						category=stock_record.category,
						quantity_change=actual_delta,
						reason="PURCHASE",
					))
			else:
				# Medicine not yet in stock table — create with zero stock.
				# Admin should restock it via the inventory management endpoint.
				stock_record = MedicineStock(
					medicine_name=med_name,
					category=resolve_medicine_category(med_name, item_category),
					current_stock=0,
					last_sold=datetime.utcnow(),
				)
				db.session.add(stock_record)

			# Capture expiry date from the purchase if provided
			if item.get("expiryDate"):
				try:
					exp = datetime.strptime(item.get("expiryDate"), "%Y-%m-%d").date()
					stock_record.expiry_date = exp
				except ValueError:
					pass

			medicines_updated.append(med_name)

		# ── SINGLE ATOMIC COMMIT ──────────────────────────────────────
		# Purchase + MedicineItems + Prescriptions + stock decrements
		# all committed together.  If anything fails, everything rolls back.
		db.session.commit()

		# ── Step 2: Trigger real-time analysis for each affected medicine ──
		# Now that stock is committed, run the rule engine per-medicine.
		# This is what makes alerts appear automatically on the Product
		# Analysis page — no manual intervention, no scheduler needed.
		# Each call evaluates all 5 rules against the new stock level
		# and upserts alerts into the realtime_alerts table.
		analysis_results = []
		for med_name in medicines_updated:
			result = trigger_inventory_analysis(medicine_name=med_name)
			analysis_results.append(result)

		return jsonify({
			"success": True,
			"purchaseId": purchase.id,
			"userId": user.id,
			"inventory_analysis": {
				"medicines_checked": len(medicines_updated),
				"results": analysis_results,
			}
		})

	except Exception as e:
		db.session.rollback()
		print(f"Error creating purchase: {str(e)}")
		return jsonify({"success": False, "message": f"Error saving purchase: {str(e)}"}), 500


@app.route("/admin/inventory-alerts", methods=["GET"])
@login_required
def get_inventory_alerts():
	if not admin_required():
		return jsonify({"success": False, "message": "Admin access required."}), 403

	try:
		alerts = InventoryAlert.query.all()
		alerts_data = []
		for alert in alerts:
			alerts_data.append({
				"medicine_category": alert.medicine_category,
				"alert_type": alert.alert_type,
				"avg_7day_demand": alert.avg_7day_demand,
				"current_stock": alert.current_stock
			})
		return jsonify({"success": True, "alerts": alerts_data})
	except Exception as e:
		print(f"Error fetching inventory alerts: {str(e)}")
		return jsonify({"success": False, "message": "Error fetching data."}), 500


@app.route("/admin/tft-predictions", methods=["GET"])
@login_required
def get_tft_predictions():
	if not admin_required():
		return jsonify({"success": False, "message": "Admin access required."}), 403

	try:
		# Build stock-category snapshot with robust category inference so
		# forecast doesn't disappear when category column is incomplete.
		stock_medicine_rows = (
			db.session.query(
				MedicineStock.medicine_name,
				MedicineStock.category,
				MedicineStock.current_stock,
			)
			.all()
		)

		stock_category_map = {}
		medicine_to_category = {}
		for row in stock_medicine_rows:
			medicine_name = (row.medicine_name or "").strip()
			if not medicine_name:
				continue

			resolved_category = (
				normalize_medicine_category(row.category)
				or resolve_medicine_category(medicine_name, row.category)
			)
			if not resolved_category:
				continue

			med_key = medicine_name.lower()
			medicine_to_category[med_key] = resolved_category

			entry = stock_category_map.setdefault(
				resolved_category,
				{"medicine_count": 0, "total_stock": 0},
			)
			entry["medicine_count"] += 1
			entry["total_stock"] += int(row.current_stock or 0)

		# Build live day-wise 7-day forecast from recent stock reductions/sales.
		lookback_days = 7
		today_date = datetime.utcnow().date()
		cutoff_dt = datetime.utcnow() - timedelta(days=lookback_days)

		# medicine_to_category is already built above with inferred categories.

		def _to_date(value):
			if value is None:
				return None
			if isinstance(value, datetime):
				return value.date()
			if isinstance(value, date):
				return value
			text_value = str(value).strip()
			if not text_value:
				return None
			try:
				return datetime.fromisoformat(text_value[:19]).date()
			except ValueError:
				try:
					return datetime.strptime(text_value[:10], "%Y-%m-%d").date()
				except ValueError:
					return None

		sales_rows = (
			db.session.query(
				MedicineItem.name.label("medicine_name"),
				sa_func.date(Purchase.created_at).label("day_key"),
				sa_func.sum(MedicineItem.quantity).label("sold_qty"),
			)
			.join(Purchase, MedicineItem.purchase_id == Purchase.id)
			.filter(Purchase.created_at >= cutoff_dt)
			.group_by(MedicineItem.name, sa_func.date(Purchase.created_at))
			.all()
		)

		category_daily_totals = {}
		for row in sales_rows:
			med_key = str(row.medicine_name or "").strip().lower()
			category = medicine_to_category.get(med_key)
			if not category:
				continue
			day_key = _to_date(row.day_key)
			if day_key is None:
				continue
			sold_qty = float(row.sold_qty or 0)
			if sold_qty <= 0:
				continue
			category_daily_totals.setdefault(category, {})
			category_daily_totals[category][day_key] = category_daily_totals[category].get(day_key, 0.0) + sold_qty

		movement_rows = (
			db.session.query(
				StockMovement.category.label("category"),
				StockMovement.medicine_name.label("medicine_name"),
				sa_func.date(StockMovement.created_at).label("day_key"),
				sa_func.sum(StockMovement.quantity_change).label("qty_change"),
			)
			.filter(StockMovement.created_at >= cutoff_dt)
			.filter(StockMovement.quantity_change < 0)
			.group_by(StockMovement.category, StockMovement.medicine_name, sa_func.date(StockMovement.created_at))
			.all()
		)
		for row in movement_rows:
			category = normalize_medicine_category(row.category)
			if not category:
				med_key = str(row.medicine_name or "").strip().lower()
				category = medicine_to_category.get(med_key)
			if not category:
				continue
			day_key = _to_date(row.day_key)
			if day_key is None:
				continue
			reduced_qty = abs(float(row.qty_change or 0))
			if reduced_qty <= 0:
				continue
			category_daily_totals.setdefault(category, {})
			category_daily_totals[category][day_key] = category_daily_totals[category].get(day_key, 0.0) + reduced_qty

		predictions_data = []
		weekday_order = [0, 1, 2, 3, 4, 5, 6]  # Mon..Sun
		day_labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
		# Include TODAY plus previous 6 days so same-day sales/reductions affect forecast immediately.
		history_dates = [today_date - timedelta(days=i) for i in range(0, lookback_days)]
		all_categories = set(stock_category_map.keys()) | set(category_daily_totals.keys())

		for category in sorted(all_categories):
			stock_meta = stock_category_map.get(category, {"medicine_count": 0, "total_stock": 0})
			daily_map = category_daily_totals.get(category, {})
			weekday_sum = {i: 0.0 for i in range(7)}
			weekday_count = {i: 0 for i in range(7)}

			for hist_day in history_dates:
				wd = hist_day.weekday()
				weekday_sum[wd] += float(daily_map.get(hist_day, 0.0))
				weekday_count[wd] += 1

			total_hist = sum(float(daily_map.get(hist_day, 0.0)) for hist_day in history_dates)
			fallback_daily = total_hist / float(lookback_days)

			day_values = []
			for wd in weekday_order:
				if weekday_count[wd] > 0:
					day_values.append(weekday_sum[wd] / float(weekday_count[wd]))
				else:
					day_values.append(fallback_daily)

			predictions_data.append({
				"series_id": category,
				"day_1": day_values[0],
				"day_2": day_values[1],
				"day_3": day_values[2],
				"day_4": day_values[3],
				"day_5": day_values[4],
				"day_6": day_values[5],
				"day_7": day_values[6],
				"in_stock_medicines": stock_meta["medicine_count"],
				"category_stock_units": stock_meta["total_stock"],
			})

		response = jsonify({
			"success": True,
			"predictions": predictions_data,
			"day_labels": day_labels,
			"source": "live-7day-weekday-forecast",
		})
		response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
		response.headers["Pragma"] = "no-cache"
		response.headers["Expires"] = "0"
		return response
	except Exception as e:
		print(f"Error fetching TFT predictions: {str(e)}")
		return jsonify({"success": False, "message": "Error fetching data."}), 500


@app.route("/admin/dashboard-stats", methods=["GET"])
def get_dashboard_stats():
	# Check if user is authenticated
	if not current_user.is_authenticated:
		return jsonify({"success": False, "message": "Authentication required."}), 401
	
	if not admin_required():
		return jsonify({"success": False, "message": "Admin access required."}), 403

	try:
		# ── Patient stats ──
		total_patients = User.query.filter_by(role="user").count()
		today = datetime.utcnow().date()
		new_patients_today = (
			User.query
			.filter_by(role="user")
			.filter(db.func.date(User.created_at) == today)
			.count()
		)

		# ── Purchase / revenue stats ──
		total_purchases = Purchase.query.count()
		revenue_row = db.session.query(db.func.sum(Purchase.grand_total)).scalar()
		total_revenue = float(revenue_row) if revenue_row else 0.0
		purchases_today = (
			Purchase.query
			.filter(db.func.date(Purchase.created_at) == today)
			.count()
		)

		# ── Inventory stock stats ──
		total_medicines = MedicineStock.query.count()
		out_of_stock = MedicineStock.query.filter(MedicineStock.current_stock <= 0).count()
		low_stock = MedicineStock.query.filter(
			MedicineStock.current_stock > 0,
			MedicineStock.reorder_level.isnot(None),
			MedicineStock.current_stock <= MedicineStock.reorder_level
		).count()
		in_stock = total_medicines - out_of_stock

		# Expiry stats from MedicineStock
		expiring_soon = MedicineStock.query.filter(
			MedicineStock.expiry_date.isnot(None),
			MedicineStock.expiry_date <= today + timedelta(days=60),
			MedicineStock.expiry_date > today
		).count()
		expired = MedicineStock.query.filter(
			MedicineStock.expiry_date.isnot(None),
			MedicineStock.expiry_date <= today
		).count()

		# ── Real-time alerts ──
		rt_total = RealTimeAlert.query.filter_by(is_resolved=False).count()
		rt_critical = RealTimeAlert.query.filter_by(severity="CRITICAL", is_resolved=False).count()
		rt_high = RealTimeAlert.query.filter_by(severity="HIGH", is_resolved=False).count()

		# ── Legacy inventory alerts ──
		total_alerts = InventoryAlert.query.count()
		low_stock_alerts = InventoryAlert.query.filter_by(alert_type="LOW_STOCK").count()
		expiry_alerts = InventoryAlert.query.filter_by(alert_type="EXPIRY_RISK").count()

		# ── Inventory accuracy ──
		if total_medicines > 0:
			healthy = total_medicines - out_of_stock - low_stock - expiring_soon - expired
			accuracy = round((max(0, healthy) / total_medicines) * 100, 1)
		else:
			total_predictions = TftPrediction.query.count()
			accuracy = 95.0
			if total_predictions > 0:
				accuracy = round(max(0, 100 - (total_alerts * 100 / total_predictions)), 1)

		return jsonify({
			"success": True,
			"stats": {
				"total_patients": total_patients,
				"new_patients_today": new_patients_today,
				"total_purchases": total_purchases,
				"purchases_today": purchases_today,
				"total_revenue": round(total_revenue, 2),
				"total_medicines": total_medicines,
				"in_stock": in_stock,
				"out_of_stock": out_of_stock,
				"low_stock_count": low_stock,
				"expiring_soon": expiring_soon,
				"expired": expired,
				"total_alerts": total_alerts,
				"low_stock_alerts": low_stock_alerts,
				"expiry_alerts": expiry_alerts,
				"rt_active_alerts": rt_total,
				"rt_critical": rt_critical,
				"rt_high": rt_high,
				"inventory_accuracy": accuracy
			}
		})
	except Exception as e:
		print(f"Error fetching dashboard stats: {str(e)}")
		return jsonify({"success": False, "message": "Error fetching stats."}), 500


@app.route("/admin/patients", methods=["GET"])
@login_required
def get_patients():
	if not admin_required():
		return jsonify({"success": False, "message": "Admin access required."}), 403

	try:
		# Get all users with role="user"
		users = User.query.filter_by(role="user").all()
		patients_data = []
		
		for user in users:
			# Try to get profile data
			profile = UserProfile.query.filter_by(user_id=user.id).first()

			# Use profile full_name directly from database
			display_name = None
			if profile and profile.full_name and profile.full_name.strip():
				display_name = profile.full_name.strip()
			
			if not display_name:
				display_name = user.mobile or user.email or f"User {user.id}"

			patients_data.append({
				"id": user.id,
				"user_code": profile.user_code if profile else f"USER-{user.id}",
				"full_name": display_name,
				"mobile": user.mobile,
				"email": user.email,
				"created_at": user.created_at.isoformat(),
				"is_active": user.is_active
			})
		
		return jsonify({"success": True, "patients": patients_data})
	except Exception as e:
		print(f"Error fetching patients: {str(e)}")
		import traceback
		print(traceback.format_exc())
		return jsonify({"success": False, "message": "Error fetching patients."}), 500


@app.route("/admin/delete-user/<int:user_id>", methods=["DELETE"])
@login_required
def delete_user(user_id):
	if not admin_required():
		return jsonify({"success": False, "message": "Admin access required."}), 403

	user = db.session.get(User, user_id)
	if not user:
		return jsonify({"success": False, "message": "User not found."}), 404

	if user.role != "user":
		return jsonify({"success": False, "message": "You can only delete regular users, not admins."}), 400

	# Prevent admin from deleting themselves (safety guard)
	if user.id == current_user.id:
		return jsonify({"success": False, "message": "Cannot delete yourself."}), 400

	try:
		# Delete all FK-linked rows before removing the user
		LoginOtpToken.query.filter_by(user_id=user.id).delete()
		PasswordResetToken.query.filter_by(user_id=user.id).delete()
		Prescription.query.filter_by(user_id=user.id).delete()
		UserProfile.query.filter_by(user_id=user.id).delete()
		# Delete the user
		db.session.delete(user)
		db.session.commit()
		return jsonify({"success": True, "message": "User deleted successfully."})
	except Exception as e:
		db.session.rollback()
		print(f"Error deleting user {user_id}: {e}")
		return jsonify({"success": False, "message": f"Error deleting user: {str(e)}"}), 500


@app.route("/user/change-password", methods=["POST"])
@login_required
def change_password():
	if current_user.role != "user":
		return jsonify({"success": False, "message": "User access required."}), 403

	data = parse_request_data()
	new_password = (data.get("newPassword") or "").strip()
	confirm_password = (data.get("confirmPassword") or "").strip()

	if not new_password or not confirm_password:
		return jsonify({"success": False, "message": "Both password fields are required."}), 400

	if new_password != confirm_password:
		return jsonify({"success": False, "message": "Passwords do not match."}), 400

	if len(new_password) < 6:
		return jsonify({"success": False, "message": "Password must be at least 6 characters long."}), 400

	current_user.set_password(new_password)
	current_user.must_change_password = False
	db.session.commit()

	return jsonify({"success": True, "message": "Password changed successfully!"})


def get_effective_prescription_end_date(prescription):
	"""
	Return the best available end/expiry date for a prescription.

	Priority:
	1) `Prescription.end_date` (canonical field)
	2) matching `MedicineItem.expiry_date` from linked purchase (legacy data)
	"""
	if prescription.end_date:
		return prescription.end_date

	purchase = getattr(prescription, "purchase", None)
	if not purchase:
		return None

	medicine_name = (prescription.medicine_name or "").strip().lower()
	for item in purchase.items:
		if not item.expiry_date:
			continue
		if medicine_name and (item.name or "").strip().lower() == medicine_name:
			return item.expiry_date

	# Last resort: any expiry date from the same purchase
	for item in purchase.items:
		if item.expiry_date:
			return item.expiry_date

	return None


@app.route("/user/medicines", methods=["GET"])
@login_required
def get_user_medicines():
	if current_user.role != "user":
		return jsonify({"success": False, "message": "User access required."}), 403

	prescriptions = Prescription.query.filter_by(user_id=current_user.id, is_active=True).all()
	medicines_data = []

	for prescription in prescriptions:
		effective_end_date = get_effective_prescription_end_date(prescription)
		display_med_name = canonicalize_medicine_name(prescription.medicine_name, use_dataset_fuzzy=False)
		# Determine what the medicine is for
		prescribed_for_text = "Myself"
		if prescription.prescribed_for == "child" and prescription.child_name:
			prescribed_for_text = f"{prescription.child_name} (Age: {prescription.child_age})"
		elif prescription.prescribed_for == "spouse":
			prescribed_for_text = "Spouse"
		elif prescription.prescribed_for == "aged_parent":
			prescribed_for_text = "Aged Parent/Relative"
		elif prescription.prescribed_for == "other":
			prescribed_for_text = "Other"

		medicines_data.append({
			"id": prescription.id,
			"medicineName": display_med_name,
			"dosage": prescription.dosage,
			"quantity": prescription.quantity,
			"instructions": prescription.instructions,
			"startDate": prescription.start_date.strftime("%Y-%m-%d %H:%M:%S"),
			"endDate": effective_end_date.strftime("%Y-%m-%d") if effective_end_date else None,
			"isActive": prescription.is_active,
			"prescribedFor": prescribed_for_text,
			"prescribedBy": prescription.admin.admin_profile.full_name if hasattr(prescription.admin, 'admin_profile') else "Admin"
		})

	return jsonify({"success": True, "medicines": medicines_data})


@app.route("/user/medicines/<int:prescription_id>", methods=["GET"])
@login_required
def get_medicine_detail(prescription_id):
	if current_user.role != "user":
		return jsonify({"success": False, "message": "User access required."}), 403

	prescription = Prescription.query.filter_by(id=prescription_id, user_id=current_user.id).first()
	if not prescription:
		return jsonify({"success": False, "message": "Medicine not found."}), 404

	effective_end_date = get_effective_prescription_end_date(prescription)
	display_med_name = canonicalize_medicine_name(prescription.medicine_name, use_dataset_fuzzy=False)

	# Determine what the medicine is for
	prescribed_for_text = "Myself"
	if prescription.prescribed_for == "child" and prescription.child_name:
		prescribed_for_text = f"{prescription.child_name} (Age: {prescription.child_age})"
	elif prescription.prescribed_for == "spouse":
		prescribed_for_text = "Spouse"
	elif prescription.prescribed_for == "aged_parent":
		prescribed_for_text = "Aged Parent/Relative"
	elif prescription.prescribed_for == "other":
		prescribed_for_text = "Other"

	return jsonify({
		"success": True,
		"medicine": {
			"id": prescription.id,
			"medicineName": display_med_name,
			"dosage": prescription.dosage,
			"quantity": prescription.quantity,
			"instructions": prescription.instructions,
			"startDate": prescription.start_date.strftime("%Y-%m-%d %H:%M:%S"),
			"endDate": effective_end_date.strftime("%Y-%m-%d") if effective_end_date else None,
			"isActive": prescription.is_active,
			"prescribedFor": prescribed_for_text,
			"prescribedBy": prescription.admin.admin_profile.full_name if hasattr(prescription.admin, 'admin_profile') else "Admin"
		}
	})


@app.route("/user/medicines/<int:prescription_id>", methods=["DELETE"])
@login_required
def remove_user_medicine(prescription_id):
	"""Soft-delete a medicine by deactivating the user's prescription."""
	if current_user.role != "user":
		return jsonify({"success": False, "message": "User access required."}), 403

	prescription = Prescription.query.filter_by(id=prescription_id, user_id=current_user.id).first()
	if not prescription:
		return jsonify({"success": False, "message": "Medicine not found."}), 404

	if not prescription.is_active:
		return jsonify({"success": True, "message": "Medicine already removed."})

	try:
		prescription.is_active = False
		db.session.commit()
		return jsonify({"success": True, "message": "Medicine removed successfully."})
	except Exception as e:
		db.session.rollback()
		print(f"[RemoveMedicine Error] {e}")
		return jsonify({"success": False, "message": "Could not remove medicine."}), 500


# =============================================================================
#  REAL-TIME INVENTORY MANAGEMENT ENDPOINTS
#  ─────────────────────────────────────────
#  These endpoints allow stock management and expose the real-time alerts
#  generated by the inventory engine.
# =============================================================================

# ─── Stock Management ───────────────────────────────────────────────────────

@app.route("/admin/inventory/stock", methods=["GET"])
@login_required
def get_all_stock():
	"""Retrieve all medicine stock records."""
	if not admin_required():
		return jsonify({"success": False, "message": "Admin access required."}), 403

	try:
		stocks = MedicineStock.query.order_by(MedicineStock.medicine_name).all()
		return jsonify({
			"success": True,
			"stock": [{
				"id": s.id,
				"medicine_name": s.medicine_name,
				"category": s.category,
				"current_stock": s.current_stock,
				"unit_price": float(s.unit_price) if s.unit_price else None,
				"expiry_date": s.expiry_date.isoformat() if s.expiry_date else None,
				"reorder_level": s.reorder_level,
				"supplier": s.supplier,
				"last_restocked": s.last_restocked.isoformat() if s.last_restocked else None,
				"last_sold": s.last_sold.isoformat() if s.last_sold else None,
			} for s in stocks]
		})
	except Exception as e:
		return jsonify({"success": False, "message": str(e)}), 500


@app.route("/admin/inventory/stock", methods=["POST"])
@login_required
def add_or_restock_medicine():
	"""
	Add a new medicine to inventory OR restock an existing one.
	
	EVENT-DRIVEN: After stock is updated, the rule engine runs automatically
	to generate/clear alerts for this medicine.
	"""
	if not admin_required():
		return jsonify({"success": False, "message": "Admin access required."}), 403

	try:
		data = parse_request_data()
		medicine_name = (data.get("medicine_name") or "").strip()
		if not medicine_name:
			return jsonify({"success": False, "message": "Medicine name is required."}), 400

		quantity = int(data.get("quantity", 0))
		if quantity <= 0:
			return jsonify({"success": False, "message": "Quantity must be positive."}), 400

		# ── CASE-INSENSITIVE LOOKUP ──────────────────────────────────
		# Use PostgreSQL LOWER() so "paracetamol" matches "Paracetamol".
		# This prevents accidental duplicate stock records for the same
		# medicine entered with different casing.
		stock = MedicineStock.query.filter(
			sa_func.lower(MedicineStock.medicine_name) == medicine_name.lower()
		).first()

		if stock:
			# ── RESTOCK: increment existing stock ──
			stock.current_stock += quantity
			stock.last_restocked = datetime.utcnow()
			resolved_category = resolve_medicine_category(
				medicine_name,
				data.get("category"),
				stock.category,
			)
			if resolved_category:
				stock.category = resolved_category
			action = "restocked"
		else:
			# ── NEW MEDICINE: create stock record ──
			expiry_date = None
			if data.get("expiry_date"):
				try:
					expiry_date = datetime.strptime(data["expiry_date"], "%Y-%m-%d").date()
				except ValueError:
					pass

			stock = MedicineStock(
				medicine_name=medicine_name,
				category=resolve_medicine_category(medicine_name, data.get("category")),
				current_stock=quantity,
				unit_price=float(data["unit_price"]) if data.get("unit_price") else None,
				expiry_date=expiry_date,
				reorder_level=int(data["reorder_level"]) if data.get("reorder_level") else None,
				supplier=(data.get("supplier") or "").strip() or None,
				last_restocked=datetime.utcnow(),
			)
			db.session.add(stock)
			action = "added"

		# Update optional fields if provided
		if data.get("unit_price"):
			stock.unit_price = float(data["unit_price"])
		if data.get("expiry_date"):
			try:
				stock.expiry_date = datetime.strptime(data["expiry_date"], "%Y-%m-%d").date()
			except ValueError:
				pass
		if data.get("category"):
			stock.category = resolve_medicine_category(medicine_name, data.get("category"), stock.category)
		if data.get("supplier"):
			stock.supplier = data["supplier"].strip()
		if data.get("reorder_level"):
			stock.reorder_level = int(data["reorder_level"])

		db.session.commit()

		# ─── EVENT-DRIVEN TRIGGER ───────────────────────────────────
		# Automatically run inventory analysis after stock change.
		#
		# What happens here:
		#   • Rule engine deletes old alerts for this medicine.
		#   • Re-evaluates all 5 rules against the NEW stock level.
		#   • If stock is now above reorder_level → no REORDER_REQUIRED
		#     alert is created → the old alert is effectively "cleared".
		#   • If expiry date is approaching → EXPIRY_RISK alert created.
		#   • Product Analysis page will show the updated state on next load.
		analysis = trigger_inventory_analysis(medicine_name=medicine_name)

		return jsonify({
			"success": True,
			"action": action,
			"medicine_name": medicine_name,
			"new_stock_level": stock.current_stock,
			"inventory_analysis": analysis,
		})
	except Exception as e:
		db.session.rollback()
		return jsonify({"success": False, "message": str(e)}), 500


@app.route("/admin/inventory/stock/<int:stock_id>", methods=["PUT"])
@login_required
def update_stock(stock_id):
	"""
	Update stock level, expiry, or other attributes of a medicine.
	
	EVENT-DRIVEN: Triggers real-time analysis after the update.
	"""
	if not admin_required():
		return jsonify({"success": False, "message": "Admin access required."}), 403

	try:
		stock = db.session.get(MedicineStock, stock_id)
		if not stock:
			return jsonify({"success": False, "message": "Stock record not found."}), 404

		data = parse_request_data()
		prev_stock = int(stock.current_stock or 0)

		# Update fields if provided
		if "current_stock" in data:
			stock.current_stock = max(0, int(data["current_stock"]))
		if "category" in data:
			stock.category = resolve_medicine_category(
				stock.medicine_name,
				data["category"],
				stock.category,
			)
		if "unit_price" in data:
			stock.unit_price = float(data["unit_price"]) if data["unit_price"] else None
		if "expiry_date" in data:
			try:
				stock.expiry_date = datetime.strptime(data["expiry_date"], "%Y-%m-%d").date() if data["expiry_date"] else None
			except ValueError:
				pass
		if "reorder_level" in data:
			stock.reorder_level = int(data.get("reorder_level", 30))
		if "supplier" in data:
			stock.supplier = (data["supplier"] or "").strip() or None

		stock.updated_at = datetime.utcnow()
		delta = int(stock.current_stock or 0) - prev_stock
		if delta != 0:
			reason = "MANUAL_REDUCTION" if delta < 0 else "MANUAL_INCREASE"
			db.session.add(StockMovement(
				medicine_name=stock.medicine_name,
				category=stock.category,
				quantity_change=delta,
				reason=reason,
			))
		db.session.commit()

		# ─── EVENT-DRIVEN TRIGGER ───────────────────────────────────
		analysis = trigger_inventory_analysis(medicine_name=stock.medicine_name)

		return jsonify({
			"success": True,
			"medicine_name": stock.medicine_name,
			"current_stock": stock.current_stock,
			"inventory_analysis": analysis,
		})
	except Exception as e:
		db.session.rollback()
		return jsonify({"success": False, "message": str(e)}), 500


@app.route("/admin/inventory/stock/<int:stock_id>", methods=["DELETE"])
@login_required
def delete_stock(stock_id):
	"""
	Delete a medicine from the inventory entirely.

	This removes the MedicineStock record AND all associated RealTimeAlerts.
	Use this when a medicine is discontinued or was added by mistake.

	EVENT-DRIVEN CLEANUP:
	  • Deletes the stock record from medicine_stock table.
	  • Deletes all realtime_alerts for that medicine (case-insensitive).
	  • No orphan alerts are left behind.

	NOTE: This does NOT delete historical purchase records (MedicineItem /
	Purchase rows).  Those are retained for audit and reporting purposes.
	"""
	if not admin_required():
		return jsonify({"success": False, "message": "Admin access required."}), 403

	try:
		stock = db.session.get(MedicineStock, stock_id)
		if not stock:
			return jsonify({"success": False, "message": "Stock record not found."}), 404

		medicine_name = stock.medicine_name

		# ── Clean up associated alerts (case-insensitive) ────────────
		# Use LOWER() to ensure we catch alerts regardless of casing,
		# matching the case-insensitive lookup pattern used everywhere.
		deleted_alerts = RealTimeAlert.query.filter(
			sa_func.lower(RealTimeAlert.medicine_name) == medicine_name.lower()
		).delete()

		# ── Delete the stock record ──────────────────────────────────
		db.session.delete(stock)
		db.session.commit()

		print(f"[StockDelete] Deleted '{medicine_name}' and {deleted_alerts} associated alert(s)")

		return jsonify({
			"success": True,
			"message": f"'{medicine_name}' has been removed from inventory.",
			"medicine_name": medicine_name,
			"alerts_removed": deleted_alerts,
		})
	except Exception as e:
		db.session.rollback()
		return jsonify({"success": False, "message": str(e)}), 500


# ─── Real-Time Alert Endpoints ──────────────────────────────────────────────

@app.route("/admin/inventory/alerts", methods=["GET"])
@login_required
def get_realtime_alerts():
	"""
	Get all active real-time inventory alerts.
	
	Optional query params:
	  ?severity=CRITICAL    → filter by severity
	  ?type=REORDER_REQUIRED → filter by alert type
	  ?unresolved=true      → only unresolved alerts (default)
	"""
	if not admin_required():
		return jsonify({"success": False, "message": "Admin access required."}), 403

	try:
		query = RealTimeAlert.query

		# Filter by severity
		severity = request.args.get("severity")
		if severity:
			query = query.filter_by(severity=severity.upper())

		# Filter by alert type
		alert_type = request.args.get("type")
		if alert_type:
			query = query.filter_by(alert_type=alert_type.upper())

		# Filter unresolved (default: only unresolved)
		show_resolved = request.args.get("unresolved", "true").lower() != "true"
		if not show_resolved:
			query = query.filter_by(is_resolved=False)

		alerts = query.order_by(
			db.case(
				(RealTimeAlert.severity == "CRITICAL", 1),
				(RealTimeAlert.severity == "HIGH", 2),
				(RealTimeAlert.severity == "MEDIUM", 3),
				else_=4,
			)
		).all()

		return jsonify({
			"success": True,
			"alerts": [{
				"id": a.id,
				"medicine_name": a.medicine_name,
				"medicine_category": a.medicine_category,
				"alert_type": a.alert_type,
				"severity": a.severity,
				"current_stock": a.current_stock,
				"threshold": a.threshold,
				"message": a.message,
				"extra_data": a.extra_data,
				"created_at": a.created_at.isoformat(),
				"is_resolved": a.is_resolved,
			} for a in alerts],
			"total": len(alerts),
			"critical_count": sum(1 for a in alerts if a.severity == "CRITICAL"),
			"high_count": sum(1 for a in alerts if a.severity == "HIGH"),
		})
	except Exception as e:
		return jsonify({"success": False, "message": str(e)}), 500


@app.route("/admin/inventory/alerts/<int:alert_id>/resolve", methods=["POST"])
@login_required
def resolve_alert(alert_id):
	"""Mark a specific alert as resolved (e.g., after restocking)."""
	if not admin_required():
		return jsonify({"success": False, "message": "Admin access required."}), 403

	try:
		alert = db.session.get(RealTimeAlert, alert_id)
		if not alert:
			return jsonify({"success": False, "message": "Alert not found."}), 404

		alert.is_resolved = True
		db.session.commit()
		return jsonify({"success": True, "message": "Alert resolved."})
	except Exception as e:
		db.session.rollback()
		return jsonify({"success": False, "message": str(e)}), 500


@app.route("/admin/inventory/analyze", methods=["POST"])
@login_required
def manual_analysis_trigger():
	"""
	Manual trigger for full inventory analysis.
	Useful for initial setup or after bulk imports.
	
	In normal operation, this is NOT needed — analysis runs automatically
	after every stock-changing event.
	"""
	if not admin_required():
		return jsonify({"success": False, "message": "Admin access required."}), 403

	try:
		result = trigger_inventory_analysis()
		return jsonify({"success": True, "analysis": result})
	except Exception as e:
		return jsonify({"success": False, "message": str(e)}), 500


@app.route("/admin/inventory/dashboard", methods=["GET"])
@login_required
def inventory_dashboard():
	"""
	Aggregated inventory dashboard data — combines stock, alerts, and predictions
	into a single API response for the frontend.
	"""
	if not admin_required():
		return jsonify({"success": False, "message": "Admin access required."}), 403

	try:
		# ── Stock counts ─────────────────────────────────────────────
		# Uses each medicine's own reorder_level for accurate REORDER_REQUIRED
		# classification, matching the rule engine's behaviour.
		total_medicines = MedicineStock.query.count()
		out_of_stock = MedicineStock.query.filter(
			MedicineStock.current_stock <= 0
		).count()
		# Low stock = current_stock > 0 AND current_stock ≤ reorder_level
		low_stock = MedicineStock.query.filter(
			MedicineStock.current_stock > 0,
			MedicineStock.current_stock <= MedicineStock.reorder_level
		).count()
		# Healthy = total minus out-of-stock minus low-stock
		healthy_stock = max(0, total_medicines - out_of_stock - low_stock)

		# ── Alert counts by severity ──────────────────────────────────
		critical_alerts = RealTimeAlert.query.filter_by(severity="CRITICAL", is_resolved=False).count()
		high_alerts = RealTimeAlert.query.filter_by(severity="HIGH", is_resolved=False).count()
		medium_alerts = RealTimeAlert.query.filter_by(severity="MEDIUM", is_resolved=False).count()
		total_alerts = critical_alerts + high_alerts + medium_alerts

		# ── Alert counts by type (for pie-chart breakdown) ─────────
		alert_breakdown = {}
		for row in db.session.query(
			RealTimeAlert.alert_type,
			db.func.count(RealTimeAlert.id)
		).filter_by(is_resolved=False).group_by(RealTimeAlert.alert_type).all():
			alert_breakdown[row[0]] = row[1]

		# ── Expiry countdown ──────────────────────────────────────────
		# Medicines expiring within 30 days (still in stock)
		today = date.today()
		expiring_soon = MedicineStock.query.filter(
			MedicineStock.expiry_date != None,
			MedicineStock.expiry_date <= today + timedelta(days=30),
			MedicineStock.current_stock > 0,
		).count()

		return jsonify({
			"success": True,
			"dashboard": {
				"total_medicines": total_medicines,
				"healthy_stock": healthy_stock,
				"out_of_stock": out_of_stock,
				"low_stock": low_stock,
				"expiring_soon": expiring_soon,
				"alerts": {
					"total": total_alerts,
					"critical": critical_alerts,
					"high": high_alerts,
					"medium": medium_alerts,
					"breakdown": alert_breakdown,
				},
			},
		})
	except Exception as e:
		return jsonify({"success": False, "message": str(e)}), 500


if __name__ == "__main__":
	with app.app_context():
		ensure_database_schema()
	app.run(
		host=os.environ.get("HOST", "0.0.0.0"),
		port=int(os.environ.get("PORT", "5000")),
		debug=env_flag("FLASK_DEBUG", default=False),
	)