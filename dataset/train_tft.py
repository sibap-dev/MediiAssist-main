import pandas as pd
import numpy as np
import torch
import torch.nn as nn
from torch.optim import Adam
import pickle
from pytorch_forecasting import TimeSeriesDataSet
from pytorch_forecasting.data import GroupNormalizer
from pytorch_forecasting.models import TemporalFusionTransformer

# Load data
df = pd.read_csv("tft_input.csv")
print(df.head())
print(f"Data shape: {df.shape}")

max_prediction_length = 7
max_encoder_length = 14

training_cutoff = df["time_idx"].max() - max_prediction_length - 14

training = TimeSeriesDataSet(
    df[df["time_idx"] <= training_cutoff],
    time_idx="time_idx",
    target="units_sold",
    group_ids=["series_id"],
    max_encoder_length=max_encoder_length,
    max_prediction_length=max_prediction_length,
    time_varying_known_reals=["Year", "Month"],
    time_varying_known_categoricals=["weekday"],
    time_varying_unknown_reals=["units_sold"],
    target_normalizer=GroupNormalizer(groups=["series_id"]),
    add_relative_time_idx=True,
    add_target_scales=True,
    add_encoder_length=True,
)

batch_size = 64
train_dataloader = training.to_dataloader(train=True, batch_size=batch_size, num_workers=0)

# Create validation dataset
validation_df = df[df["time_idx"] > training_cutoff].copy()
validation = TimeSeriesDataSet.from_dataset(training, validation_df, predict=False)
val_dataloader = validation.to_dataloader(train=False, batch_size=batch_size, num_workers=0)

# Create model
tft = TemporalFusionTransformer.from_dataset(
    training,
    learning_rate=0.03,
    hidden_size=16,
    attention_head_size=4,
    dropout=0.1,
    hidden_continuous_size=8,
)

# Manual training loop
device = "cuda" if torch.cuda.is_available() else "cpu"
tft = tft.to(device)
tft.train()

optimizer = Adam(tft.parameters(), lr=0.03)
loss_fn = nn.MSELoss()

epochs = 3
max_batches_per_epoch = 50  # limit for faster runs; set to None for full epoch
max_val_batches = 10

try:
    for epoch in range(epochs):
        total_loss = 0
        batch_count = 0
        
        for batch_idx, batch in enumerate(train_dataloader):
            if max_batches_per_epoch is not None and batch_idx >= max_batches_per_epoch:
                break

            optimizer.zero_grad()
            
            # Move batch to device
            x = {k: v.to(device) if isinstance(v, torch.Tensor) else v for k, v in batch[0].items()}
            y = batch[1][0].to(device)
            
            # Forward pass - returns predictions with shape [batch_size, prediction_length, num_quantiles]
            predictions = tft(x)
            
            # Use the median quantile for loss calculation
            pred = predictions[0]
            median_pred = pred[:, :, pred.shape[-1] // 2]
            
            # Calculate loss
            loss = loss_fn(median_pred, y)
            
            # Backward pass
            loss.backward()
            torch.nn.utils.clip_grad_norm_(tft.parameters(), 0.1)
            optimizer.step()
            
            total_loss += loss.item()
            batch_count += 1
        
        avg_loss = total_loss / batch_count if batch_count > 0 else 0
        print(f"Epoch {epoch+1}/{epochs}, Loss: {avg_loss:.4f}")
        
        # Validation
        tft.eval()
        val_loss = 0
        val_count = 0
        with torch.no_grad():
            for batch_idx, batch in enumerate(val_dataloader):
                if max_val_batches is not None and batch_idx >= max_val_batches:
                    break

                x = {k: v.to(device) if isinstance(v, torch.Tensor) else v for k, v in batch[0].items()}
                y = batch[1][0].to(device)
                
                predictions = tft(x)
                pred = predictions[0]
                median_pred = pred[:, :, pred.shape[-1] // 2]
                loss = loss_fn(median_pred, y)
                
                val_loss += loss.item()
                val_count += 1
        
        if val_count > 0:
            avg_val_loss = val_loss / val_count
            print(f"  Validation Loss: {avg_val_loss:.4f}")
        
        tft.train()

    print("Training completed successfully!")
except KeyboardInterrupt:
    print("Training interrupted by user. Partial results are available.")

# Save model weights and dataset configuration
torch.save(tft.state_dict(), "tft_model.pt")
with open("tft_dataset.pkl", "wb") as f:
    pickle.dump(training, f)
print("Saved model to tft_model.pt and dataset to tft_dataset.pkl")