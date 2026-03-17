import os
os.environ.setdefault("LIGHTNING_SHOW_TIPS", "0")
os.environ.setdefault("LIGHTNING_DISABLE_TIPS", "1")
os.environ.setdefault("DISABLE_LITMODELS_TIP", "1")

import pickle
import warnings
import torch
from pytorch_forecasting.models import TemporalFusionTransformer
try:
    from sklearn.exceptions import InconsistentVersionWarning
    warnings.filterwarnings("ignore", category=InconsistentVersionWarning)
except Exception:
    pass

warnings.filterwarnings("ignore", message="Attribute 'loss' is an instance of `nn.Module`*")
warnings.filterwarnings("ignore", message="Attribute 'logging_metrics' is an instance of `nn.Module`*")
warnings.filterwarnings("ignore", message="Starting from v1.9.0, `tensorboardX` has been removed*")
warnings.filterwarnings("ignore", message="The 'predict_dataloader' does not have many workers*")
warnings.filterwarnings("ignore", message=r"`isinstance\(treespec, LeafSpec\)` is deprecated*")

# Load dataset definition
with open("tft_dataset.pkl", "rb") as f:
    training = pickle.load(f)

# Recreate model from dataset and load weights
tft = TemporalFusionTransformer.from_dataset(training)
tft.load_state_dict(torch.load("tft_model.pt", map_location="cpu"))
tft.eval()

print("TFT model loaded successfully!")

import pandas as pd
import numpy as np
from pytorch_forecasting import TimeSeriesDataSet
import matplotlib.pyplot as plt

df = pd.read_csv("tft_input.csv")

# -----------------------------------
# Create prediction dataset
# -----------------------------------
prediction_dataset = TimeSeriesDataSet.from_dataset(
    training,
    df,
    predict=True,
    stop_randomization=True
)


prediction_dataloader = prediction_dataset.to_dataloader(
    train=False,
    batch_size=64,
    num_workers=0
)

# -----------------------------------
# Generate predictions
# -----------------------------------
predictions = tft.predict(
    prediction_dataloader,
    mode="prediction"
)

print("Predictions generated:", predictions.shape)

# -----------------------------------
# Convert predictions to DataFrame
# -----------------------------------
# Use series IDs from the original dataframe to avoid KeyError
series_ids = df["series_id"].unique()

pred_df = pd.DataFrame(
    predictions.numpy(),
    columns=[f"day_{i+1}" for i in range(predictions.shape[1])]
)

# Align lengths if needed
if len(series_ids) >= len(pred_df):
    pred_df["series_id"] = series_ids[: len(pred_df)]
else:
    pred_df["series_id"] = list(series_ids) + ["unknown"] * (len(pred_df) - len(series_ids))

print(pred_df.head())

# -----------------------------------
# Save predictions
# -----------------------------------
pred_df.to_csv("tft_predictions.csv", index=False)
print("Predictions saved to tft_predictions.csv")

# -----------------------------------
# Quick visualization (optional)
# -----------------------------------
row = pred_df.iloc[0]
day_cols = [f"day_{i+1}" for i in range(7)]
plt.plot(range(1, 8), row[day_cols].values, marker="o")
plt.title(f"7-Day Demand Forecast for {row['series_id']}")
plt.xlabel("Day")
plt.ylabel("Predicted Units Sold")
plt.grid(True)
plt.show()
