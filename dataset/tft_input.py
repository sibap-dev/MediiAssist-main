import pandas as pd

df = pd.read_csv("ds-2.csv")
df["datum"] = pd.to_datetime(df["datum"])
keep_cols = [
    "datum", "Year", "Month", "Weekday Name",
    "M01AB", "M01AE", "N02BA", "N02BE",
    "N05B", "N05C", "R03", "R06"
]

df = df[keep_cols]
value_cols = [
    "M01AB", "M01AE", "N02BA", "N02BE",
    "N05B", "N05C", "R03", "R06"
]

long_df = df.melt(
    id_vars=["datum", "Year", "Month", "Weekday Name"],
    value_vars=value_cols,
    var_name="series_id",
    value_name="units_sold"
)
long_df = long_df.sort_values(["series_id", "datum"])
long_df["time_idx"] = (
    long_df.groupby("series_id").cumcount()
)
tft_input = long_df.rename(columns={
    "Weekday Name": "weekday"
})

tft_input = tft_input[
    ["time_idx", "series_id", "units_sold", "Year", "Month", "weekday"]
]
print(tft_input.head())
print(tft_input.tail())
print(tft_input.isnull().sum())

tft_input.to_csv("tft_input.csv", index=False)