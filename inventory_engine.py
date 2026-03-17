"""
=============================================================================
  Real-Time Inventory Analysis Engine
  ────────────────────────────────────
  Event-driven, rule-based inventory analysis for the MediAssist system.

  ARCHITECTURE:
      Sale / Stock Update  ──►  run_inventory_analysis()
                                       │
                           ┌───────────┼───────────────┐
                           ▼           ▼               ▼
                    Check Low      Check Expiry    Check Demand
                     Stock          Risk           vs. Stock
                           │           │               │
                           └───────────┼───────────────┘
                                       ▼
                              Upsert Alerts in DB
                                       │
                                       ▼
                              Return alert summary

  DESIGN PRINCIPLES:
  1. Pure functions — each rule is an independent, testable function
  2. No external APIs — everything runs in-process against PostgreSQL
  3. No scheduler — triggered synchronously after each DB write
  4. ML model is NEVER retrained here — predictions are read-only
  5. Idempotent — safe to re-run; alerts are upserted, not duplicated
=============================================================================
"""

from datetime import datetime, date, timedelta
from typing import Optional
from sqlalchemy import func as sa_func  # For LOWER() in case-insensitive medicine lookups


# ─── Configurable Thresholds ────────────────────────────────────────────────
# These can be overridden per-hospital or loaded from a config table later.

THRESHOLDS = {
    "low_stock_qty": 30,              # Units: alert when stock falls below this
    "critical_stock_qty": 10,         # Units: alert when stock is critically low
    "out_of_stock_qty": 0,            # Units: alert when stock hits zero
    "expiry_warning_days": 60,        # Days: alert when medicine expires within this
    "expiry_critical_days": 30,       # Days: alert when expiry is imminent
    "demand_safety_factor": 1.5,      # Multiplier: reorder when demand * factor > stock
}


def build_live_7day_demand_map(
    db,
    MedicineStock,
    Purchase=None,
    MedicineItem=None,
    StockMovement=None,
    lookback_days: int = 7,
) -> dict:
    """
    Build category-level average daily demand from LIVE sales rows.

        Method:
      1. Map medicine names -> categories from MedicineStock.
      2. Sum sold quantities from Purchase + MedicineItem in the last N days.
            3. Add manual stock reduction movements in the last N days.
      3. Convert totals to avg daily demand per category.

    Returns:
      {"N02BE": 21.4, "R03": 4.1, ...}
    """
    lookback_days = max(1, int(lookback_days or 7))
    cutoff_dt = datetime.utcnow() - timedelta(days=lookback_days)

    # Medicine name -> category (case-insensitive key)
    stock_rows = (
        db.session.query(MedicineStock.medicine_name, MedicineStock.category)
        .filter(MedicineStock.category.isnot(None))
        .filter(sa_func.trim(MedicineStock.category) != "")
        .all()
    )
    medicine_to_category = {
        str(row.medicine_name or "").strip().lower(): str(row.category or "").strip().upper()
        for row in stock_rows
        if str(row.medicine_name or "").strip() and str(row.category or "").strip()
    }
    category_totals = {}

    # Include explicit stock reduction movements (e.g., purchase/manual reductions).
    if StockMovement is not None:
        movement_rows = (
            db.session.query(
                StockMovement.category.label("category"),
                StockMovement.medicine_name.label("medicine_name"),
                sa_func.sum(StockMovement.quantity_change).label("qty_change"),
            )
            .filter(StockMovement.created_at >= cutoff_dt)
            .filter(StockMovement.quantity_change < 0)
            .group_by(StockMovement.category, StockMovement.medicine_name)
            .all()
        )
        for row in movement_rows:
            category = str(row.category or "").strip().upper()
            if not category:
                med_key = str(row.medicine_name or "").strip().lower()
                category = medicine_to_category.get(med_key)
            if not category:
                continue
            reduced_qty = abs(float(row.qty_change or 0))
            if reduced_qty <= 0:
                continue
            category_totals[category] = category_totals.get(category, 0.0) + reduced_qty

    # Sales fallback for setups where movement records are missing/sparse.
    if not category_totals and Purchase is not None and MedicineItem is not None:
        sales_rows = (
            db.session.query(
                MedicineItem.name.label("medicine_name"),
                sa_func.sum(MedicineItem.quantity).label("sold_qty"),
            )
            .join(Purchase, MedicineItem.purchase_id == Purchase.id)
            .filter(Purchase.created_at >= cutoff_dt)
            .group_by(MedicineItem.name)
            .all()
        )
        for row in sales_rows:
            med_key = str(row.medicine_name or "").strip().lower()
            category = medicine_to_category.get(med_key)
            if not category:
                continue
            sold_qty = float(row.sold_qty or 0)
            if sold_qty <= 0:
                continue
            category_totals[category] = category_totals.get(category, 0.0) + sold_qty

    return {
        category: (total_qty / float(lookback_days))
        for category, total_qty in category_totals.items()
    }


# ─── Individual Rule Functions ──────────────────────────────────────────────
# Each function takes medicine data and returns an alert dict (or None).
# This makes each rule independently testable and composable.

def check_out_of_stock(medicine_name: str, current_stock: int, category: str = "") -> Optional[dict]:
    """
    Rule 1: OUT OF STOCK
    Triggers when stock reaches exactly zero.
    Severity: CRITICAL — immediate action required.
    """
    if current_stock <= THRESHOLDS["out_of_stock_qty"]:
        return {
            "medicine_name": medicine_name,
            "medicine_category": category,
            "alert_type": "OUT_OF_STOCK",
            "severity": "CRITICAL",
            "current_stock": current_stock,
            "threshold": THRESHOLDS["out_of_stock_qty"],
            "message": f"{medicine_name} is OUT OF STOCK. Immediate reorder required.",
        }
    return None


def check_critical_stock(medicine_name: str, current_stock: int, category: str = "") -> Optional[dict]:
    """
    Rule 2: CRITICAL LOW STOCK
    Triggers when stock is above zero but below the critical threshold.
    Severity: HIGH — reorder urgently.
    """
    if 0 < current_stock <= THRESHOLDS["critical_stock_qty"]:
        return {
            "medicine_name": medicine_name,
            "medicine_category": category,
            "alert_type": "CRITICAL_LOW_STOCK",
            "severity": "HIGH",
            "current_stock": current_stock,
            "threshold": THRESHOLDS["critical_stock_qty"],
            "message": f"{medicine_name} stock critically low ({current_stock} units). Urgent reorder needed.",
        }
    return None


def check_low_stock(medicine_name: str, current_stock: int, category: str = "", reorder_level: Optional[int] = None) -> Optional[dict]:
    """
    Rule 3: REORDER_REQUIRED (was LOW_STOCK)
    Triggers when stock ≤ reorder_level but above the critical threshold.
    Severity: MEDIUM — plan a reorder soon.

    The threshold is determined by:
      1. The per-medicine reorder_level (from MedicineStock.reorder_level), OR
      2. The global THRESHOLDS["low_stock_qty"] as fallback.
    This allows each medicine to have its own reorder point.

    NOTE: alert_type is "REORDER_REQUIRED" — this is the user-facing label
    shown on the Product Analysis page and in API responses.
    """
    threshold = reorder_level if reorder_level is not None else THRESHOLDS["low_stock_qty"]
    if THRESHOLDS["critical_stock_qty"] < current_stock <= threshold:
        return {
            "medicine_name": medicine_name,
            "medicine_category": category,
            "alert_type": "REORDER_REQUIRED",
            "severity": "MEDIUM",
            "current_stock": current_stock,
            "threshold": threshold,
            "message": f"{medicine_name} stock is low ({current_stock} units, reorder at {threshold}). Reorder required.",
        }
    return None


def check_expiry_risk(
    medicine_name: str,
    current_stock: int,
    expiry_date: Optional[date],
    category: str = "",
) -> Optional[dict]:
    """
    Rule 4: EXPIRY RISK
    Triggers when medicine will expire within the configured warning window
    AND there is still stock remaining (expired + zero stock = already handled).
    Severity: HIGH if within critical window, MEDIUM otherwise.
    """
    if expiry_date is None or current_stock <= 0:
        return None

    today = date.today()
    days_until_expiry = (expiry_date - today).days

    if days_until_expiry < 0:
        # Already expired
        return {
            "medicine_name": medicine_name,
            "medicine_category": category,
            "alert_type": "EXPIRED",
            "severity": "CRITICAL",
            "current_stock": current_stock,
            "threshold": 0,
            "days_until_expiry": days_until_expiry,
            "expiry_date": expiry_date.isoformat(),
            "message": f"{medicine_name} has EXPIRED ({-days_until_expiry} days ago). "
                       f"{current_stock} units must be disposed.",
        }
    elif days_until_expiry <= THRESHOLDS["expiry_critical_days"]:
        return {
            "medicine_name": medicine_name,
            "medicine_category": category,
            "alert_type": "EXPIRY_RISK",
            "severity": "HIGH",
            "current_stock": current_stock,
            "threshold": THRESHOLDS["expiry_critical_days"],
            "days_until_expiry": days_until_expiry,
            "expiry_date": expiry_date.isoformat(),
            "message": f"{medicine_name} expires in {days_until_expiry} days! "
                       f"{current_stock} units at risk.",
        }
    elif days_until_expiry <= THRESHOLDS["expiry_warning_days"]:
        return {
            "medicine_name": medicine_name,
            "medicine_category": category,
            "alert_type": "EXPIRY_WARNING",
            "severity": "MEDIUM",
            "current_stock": current_stock,
            "threshold": THRESHOLDS["expiry_warning_days"],
            "days_until_expiry": days_until_expiry,
            "expiry_date": expiry_date.isoformat(),
            "message": f"{medicine_name} expires in {days_until_expiry} days. "
                       f"Plan to use or discount {current_stock} units.",
        }
    return None


def check_demand_exceeds_stock(
    medicine_name: str,
    current_stock: int,
    avg_daily_demand: float,
    category: str = "",
) -> Optional[dict]:
    """
    Rule 5: DEMAND EXCEEDS STOCK (REORDER)
    Triggers when projected 7-day demand (with safety factor) exceeds stock.
    Uses TFT model predictions if available, otherwise falls back to
    historical sales average.
    Severity: HIGH.
    """
    if avg_daily_demand <= 0 or current_stock <= 0:
        return None

    projected_7day = avg_daily_demand * 7 * THRESHOLDS["demand_safety_factor"]

    if projected_7day > current_stock:
        days_of_stock = current_stock / avg_daily_demand if avg_daily_demand > 0 else 999
        return {
            "medicine_name": medicine_name,
            "medicine_category": category,
            "alert_type": "REORDER",
            "severity": "HIGH",
            "current_stock": current_stock,
            "avg_daily_demand": round(avg_daily_demand, 2),
            "projected_7day_demand": round(projected_7day, 2),
            "days_of_stock_remaining": round(days_of_stock, 1),
            "message": f"{medicine_name}: projected 7-day demand ({projected_7day:.0f}) "
                       f"exceeds stock ({current_stock}). ~{days_of_stock:.0f} days left.",
        }
    return None


# ─── Composite Analysis ────────────────────────────────────────────────────

def analyze_single_medicine(
    medicine_name: str,
    current_stock: int,
    expiry_date: Optional[date] = None,
    avg_daily_demand: float = 0.0,
    category: str = "",
    reorder_level: Optional[int] = None,
) -> list[dict]:
    """
    Run ALL rules against a single medicine and return the list of triggered alerts.
    Rules are evaluated in priority order; a medicine can trigger multiple alerts
    simultaneously (e.g., low stock AND expiring soon).

    PARAMETER: reorder_level
      Per-medicine low-stock threshold from MedicineStock.reorder_level.
      If None, falls back to the global THRESHOLDS["low_stock_qty"] (30).

    ALERT TYPES PRODUCED:
      • OUT_OF_STOCK       — stock = 0     (CRITICAL)
      • CRITICAL_LOW_STOCK — stock ≤ 10    (HIGH)
      • REORDER_REQUIRED   — stock ≤ reorder_level  (MEDIUM)
      • EXPIRED / EXPIRY_RISK / EXPIRY_WARNING       (varies)
      • REORDER            — demand × safety > stock (HIGH)
    """
    alerts = []

    # Stock-level rules (mutually exclusive by threshold bands)
    # Evaluated in severity order: out_of_stock > critical > low
    for rule_fn in [check_out_of_stock, check_critical_stock]:
        result = rule_fn(medicine_name, current_stock, category)
        if result:
            alerts.append(result)
            break  # Only the most severe stock alert applies
    else:
        # No critical/OOS alert → check reorder_required with per-medicine reorder_level
        low_result = check_low_stock(medicine_name, current_stock, category, reorder_level)
        if low_result:
            alerts.append(low_result)

    # Expiry rule (independent of stock level)
    expiry_alert = check_expiry_risk(medicine_name, current_stock, expiry_date, category)
    if expiry_alert:
        alerts.append(expiry_alert)

    # Demand-vs-stock rule (independent)
    demand_alert = check_demand_exceeds_stock(medicine_name, current_stock, avg_daily_demand, category)
    if demand_alert:
        alerts.append(demand_alert)

    return alerts


# ─── Database-Integrated Analysis ──────────────────────────────────────────
# These functions use SQLAlchemy models and must be called within a Flask
# app context.

def run_inventory_analysis(
    db,
    MedicineStock,
    RealTimeAlert,
    TftPrediction=None,
    Purchase=None,
    MedicineItem=None,
    StockMovement=None,
    demand_lookback_days: int = 7,
):
    """
    MAIN ENTRY POINT — Real-time inventory analysis.

    Called automatically after:
      • A new purchase/sale is recorded
      • Stock levels are updated (restock, adjustment)
      • Medicine is added or removed from inventory

    This function:
      1. Reads all medicines from the MedicineStock table
      2. Optionally loads TFT demand predictions for demand-vs-stock rules
      3. Runs every rule against every medicine
      4. Upserts alerts into the RealTimeAlert table (insert or update)
      5. Removes stale alerts for medicines that are no longer at risk
      6. Returns a summary dict for API responses

    IDEMPOTENT: Safe to call multiple times — alerts are upserted by
    (medicine_name, alert_type) composite key.
    """
    # Step 1: Load all current stock records
    all_stock = MedicineStock.query.all()

    if not all_stock:
        return {"triggered": False, "alerts_generated": 0, "message": "No stock data found."}

    # Step 2: Build LIVE demand map from the last 7 days of sales.
    # If no sales history exists yet, demand_map remains empty (0 demand fallback).
    demand_map = {}
    try:
        demand_map = build_live_7day_demand_map(
            db,
            MedicineStock,
            Purchase=Purchase,
            MedicineItem=MedicineItem,
            StockMovement=StockMovement,
            lookback_days=demand_lookback_days,
        )
    except Exception as e:
        print(f"[InventoryEngine] Live demand map unavailable: {e}")

    # Step 3: Run rules against every medicine
    all_alerts = []
    medicines_analyzed = 0

    for stock in all_stock:
        medicines_analyzed += 1

        # Look up demand prediction by category (if available)
        avg_demand = demand_map.get((stock.category or "").upper(), 0.0)

        # Run composite analysis.
        # Pass the per-medicine reorder_level so that LOW_STOCK alerts
        # respect each medicine's own threshold (not just the global default).
        alerts = analyze_single_medicine(
            medicine_name=stock.medicine_name,
            current_stock=stock.current_stock,
            expiry_date=stock.expiry_date,
            avg_daily_demand=avg_demand,
            category=stock.category or "",
            reorder_level=stock.reorder_level,
        )
        all_alerts.extend(alerts)

    # Step 4: Upsert alerts into the database
    # Strategy: delete existing alerts PER MEDICINE, then insert fresh ones.
    # This avoids the destructive "delete ALL" approach, which would wipe
    # alerts for medicines not currently being analyzed (edge case safety).
    #
    # Build a set of all medicine names we just analyzed so we can scope deletes.
    analyzed_medicines = {stock.medicine_name for stock in all_stock}

    try:
        for med_name in analyzed_medicines:
            # Case-insensitive delete: ensures alerts are cleaned up even if
            # the stored alert name has different casing than the stock record.
            RealTimeAlert.query.filter(
                sa_func.lower(RealTimeAlert.medicine_name) == med_name.lower()
            ).delete()
        db.session.flush()
    except Exception as e:
        print(f"[InventoryEngine] Error clearing old alerts: {e}")
        db.session.rollback()

    alerts_saved = 0
    for alert_data in all_alerts:
        try:
            alert_record = RealTimeAlert(
                medicine_name=alert_data["medicine_name"],
                medicine_category=alert_data.get("medicine_category", ""),
                alert_type=alert_data["alert_type"],
                severity=alert_data.get("severity", "MEDIUM"),
                current_stock=alert_data["current_stock"],
                threshold=alert_data.get("threshold", 0),
                message=alert_data["message"],
                extra_data={
                    k: v for k, v in alert_data.items()
                    if k not in ("medicine_name", "medicine_category", "alert_type",
                                 "severity", "current_stock", "threshold", "message")
                },
            )
            db.session.add(alert_record)
            alerts_saved += 1
        except Exception as e:
            print(f"[InventoryEngine] Error saving alert for {alert_data['medicine_name']}: {e}")

    try:
        db.session.commit()
    except Exception as e:
        print(f"[InventoryEngine] Error committing alerts: {e}")
        db.session.rollback()
        return {"triggered": True, "alerts_generated": 0, "error": str(e)}

    summary = {
        "triggered": True,
        "medicines_analyzed": medicines_analyzed,
        "alerts_generated": alerts_saved,
        "alert_types": {},
        "timestamp": datetime.utcnow().isoformat(),
    }

    # Count alerts by type for the summary
    for alert in all_alerts:
        atype = alert["alert_type"]
        summary["alert_types"][atype] = summary["alert_types"].get(atype, 0) + 1

    print(f"[InventoryEngine] Analysis complete: {medicines_analyzed} medicines → {alerts_saved} alerts")
    return summary


def run_single_medicine_analysis(
    db,
    MedicineStock,
    RealTimeAlert,
    medicine_name: str,
    TftPrediction=None,
    Purchase=None,
    MedicineItem=None,
    StockMovement=None,
    demand_lookback_days: int = 7,
):
    """
    Targeted analysis for a SINGLE medicine.
    More efficient than full scan — called when only one medicine's stock changed.

    Used after:
      • A specific medicine is sold
      • A specific medicine is restocked
    """
    # ── CASE-INSENSITIVE LOOKUP ────────────────────────────────────────
    # Use PostgreSQL LOWER() so "paracetamol" matches "Paracetamol" in DB.
    # This ensures the analysis runs regardless of input casing.
    stock = MedicineStock.query.filter(
        sa_func.lower(MedicineStock.medicine_name) == medicine_name.strip().lower()
    ).first()
    if not stock:
        return {"triggered": False, "message": f"Medicine '{medicine_name}' not found in stock."}

    # Load LIVE demand estimate for this medicine's category
    avg_demand = 0.0
    if stock.category:
        try:
            demand_map = build_live_7day_demand_map(
                db,
                MedicineStock,
                Purchase=Purchase,
                MedicineItem=MedicineItem,
                StockMovement=StockMovement,
                lookback_days=demand_lookback_days,
            )
            avg_demand = demand_map.get((stock.category or "").strip().upper(), 0.0)
        except Exception as e:
            print(f"[InventoryEngine] Single-medicine live demand unavailable: {e}")

    # Run analysis
    # Pass the per-medicine reorder_level so LOW_STOCK uses the correct threshold.
    alerts = analyze_single_medicine(
        medicine_name=stock.medicine_name,
        current_stock=stock.current_stock,
        expiry_date=stock.expiry_date,
        avg_daily_demand=avg_demand,
        category=stock.category or "",
        reorder_level=stock.reorder_level,
    )

    # Remove old alerts for this specific medicine, then insert new ones.
    # Use LOWER() to match alerts regardless of how the name was originally stored.
    try:
        RealTimeAlert.query.filter(
            sa_func.lower(RealTimeAlert.medicine_name) == medicine_name.strip().lower()
        ).delete()
        for alert_data in alerts:
            alert_record = RealTimeAlert(
                medicine_name=alert_data["medicine_name"],
                medicine_category=alert_data.get("medicine_category", ""),
                alert_type=alert_data["alert_type"],
                severity=alert_data.get("severity", "MEDIUM"),
                current_stock=alert_data["current_stock"],
                threshold=alert_data.get("threshold", 0),
                message=alert_data["message"],
                extra_data={
                    k: v for k, v in alert_data.items()
                    if k not in ("medicine_name", "medicine_category", "alert_type",
                                 "severity", "current_stock", "threshold", "message")
                },
            )
            db.session.add(alert_record)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        print(f"[InventoryEngine] Single-medicine analysis error: {e}")
        return {"triggered": True, "alerts_generated": 0, "error": str(e)}

    print(f"[InventoryEngine] {medicine_name}: {len(alerts)} alert(s) generated")
    return {
        "triggered": True,
        "medicine": medicine_name,
        "alerts_generated": len(alerts),
        "alerts": alerts,
    }
