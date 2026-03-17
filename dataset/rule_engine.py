import pandas as pd
from datetime import datetime

pred_df = pd.read_csv("tft_predictions.csv")


inventory_data = {
    "M01AB": {"stock": 120, "expiry_days": 180},
    "M01AE": {"stock": 40, "expiry_days": 60},
    "N02BA": {"stock": 25, "expiry_days": 45},
    "N02BE": {"stock": 200, "expiry_days": 300},
    "N05B": {"stock": 15, "expiry_days": 30},
    "N05C": {"stock": 80, "expiry_days": 90},
    "R03": {"stock": 35, "expiry_days": 40},
    "R06": {"stock": 20, "expiry_days": 20},
}


alerts = []
day_cols = [f"day_{i}" for i in range(1, 8)]

for _, row in pred_df.iterrows():
    series = row["series_id"]
    avg_demand = pd.to_numeric(row[day_cols], errors="coerce").mean()

    stock = inventory_data[series]["stock"]
    expiry_days = inventory_data[series]["expiry_days"]

    # Rule 1: Reorder Alert
    if avg_demand > stock:
        alerts.append((series, "REORDER", avg_demand, stock))

    # Rule 2: Low Stock Alert
    elif stock < 30:
        alerts.append((series, "LOW_STOCK", avg_demand, stock))

    # Rule 3: Expiry Risk Alert
    if expiry_days < 60 and avg_demand < stock:
        alerts.append((series, "EXPIRY_RISK", avg_demand, stock))


alert_df = pd.DataFrame(
    alerts,
    columns=["Medicine_Category", "Alert_Type", "Avg_7Day_Demand", "Current_Stock"]
)

print(alert_df)


alert_df.to_csv("inventory_alerts.csv", index=False)
