import pandas as pd
import numpy as np
from datetime import datetime, timezone
import joblib
import os
import traceback
from geopy import Point # For NASA location

from NASA import NASAPowerProducts, NASAPowerFetchData, TemporalResolution
from CAMS import get_cams_data

NASA_MAX_PARAMS_PER_REQUEST = 20 

class GHIPredictor:
    """
    Loads a pre-trained GHI correction model and uses it to make predictions.
    It fetches data from NASA and CAMS, preprocesses it, and applies the model.
    """
    def __init__(self, model_base_dir, model_type='random_forest'):
        """
        Initializes the predictor by loading model artifacts.

        Args:
            model_base_dir (str): Path to the directory containing model.joblib, 
                                  scaler.joblib (if used), and metadata.joblib.
            model_type (str): The type of model (e.g., 'random_forest'), 
                              used for constructing filenames.
        """
        self.model_base_dir = model_base_dir
        self.model_type = model_type
        self.model = None
        self.scaler = None
        self.metadata = None
        self.is_loaded = False

        if not os.path.isdir(self.model_base_dir):
            raise FileNotFoundError(f"Model base directory not found: {self.model_base_dir}")

        try:
            self._load_artifacts()
        except FileNotFoundError as e:
            print(f"Error during GHIPredictor initialization: {e}")
            print("Please ensure model_base_dir and model_type are correct and all artifacts exist.")
            raise # Re-raise the exception to halt if loading fails

    def _load_artifacts(self):
        """Loads the model, scaler, and metadata from disk."""
        model_filename = f"{self.model_type}_model.joblib"
        metadata_filename = f"{self.model_type}_metadata.joblib"
        scaler_filename = f"{self.model_type}_scaler.joblib"

        model_path = os.path.join(self.model_base_dir, model_filename)
        metadata_path = os.path.join(self.model_base_dir, metadata_filename)
        
        print(f"Attempting to load metadata from: {metadata_path}")
        if not os.path.exists(metadata_path):
            raise FileNotFoundError(f"Metadata file not found: {metadata_path}")
        self.metadata = joblib.load(metadata_path)
        print("Metadata loaded successfully.")

        print(f"Attempting to load model from: {model_path}")
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"Model file not found: {model_path}")
        self.model = joblib.load(model_path)
        print("Model loaded successfully.")

        scaler_used = self.metadata.get('scaler_used', False)
        if scaler_used:
            scaler_path = os.path.join(self.model_base_dir, scaler_filename)
            print(f"Attempting to load scaler from: {scaler_path}")
            if not os.path.exists(scaler_path):
                raise FileNotFoundError(f"Scaler file ({scaler_path}) not found, but metadata indicates it was used.")
            self.scaler = joblib.load(scaler_path)
            print("Scaler loaded successfully.")
        else:
            self.scaler = None
            print("No scaler was used during training (or not specified in metadata).")
        
        self.is_loaded = True
        print(f"Model '{self.model_type}' and associated artifacts loaded.")
        print(f"  Features expected by model: {len(self.metadata.get('feature_cols', []))}")
        print(f"  Satellite GHI column to be corrected: {self.metadata.get('est_ghi_col')}")


    def _fetch_nasa_data_in_chunks(self, nasa_fetcher, temporal_resolution, start_dt_utc, end_dt_utc, location, products_to_fetch):
        """Fetches NASA data in chunks if the number of products exceeds the limit."""
        all_nasa_data = []
        product_list = list(products_to_fetch) # Convert set to list for slicing

        for i in range(0, len(product_list), NASA_MAX_PARAMS_PER_REQUEST):
            chunk = product_list[i:i + NASA_MAX_PARAMS_PER_REQUEST]
            print(f"Fetching NASA chunk {i // NASA_MAX_PARAMS_PER_REQUEST + 1}: {len(chunk)} products")
            try:
                nasa_raw_chunk = nasa_fetcher.fetch_multiple_parameters(
                    temporal_resolution=temporal_resolution,
                    start_date=start_dt_utc,
                    end_date=end_dt_utc,
                    location=location,
                    products=chunk
                )
                if nasa_raw_chunk is not None and not pd.DataFrame(nasa_raw_chunk).empty:
                    all_nasa_data.append(pd.DataFrame(nasa_raw_chunk))
                else:
                    print(f"Warning: NASA chunk {i // NASA_MAX_PARAMS_PER_REQUEST + 1} returned empty or None.")
            except Exception as e:
                print(f"Error fetching NASA chunk {i // NASA_MAX_PARAMS_PER_REQUEST + 1}: {e}")
                # Decide if you want to continue or raise error
        
        if not all_nasa_data:
            print("Warning: No data fetched from NASA after chunking.")
            return pd.DataFrame()
        
        
        nasa_df_combined = pd.concat(all_nasa_data, axis=1)
        
        nasa_df_combined = nasa_df_combined.loc[:, ~nasa_df_combined.columns.duplicated()]
        return nasa_df_combined




    def _prepare_features_for_prediction(self, latitude, longitude, start_dt_utc, end_dt_utc):
        """
        Fetches raw data from NASA & CAMS, merges, and preprocesses it 
        to match the feature set required by the loaded model.
        This method MUST replicate the feature engineering from the training script.
        """
        if not self.is_loaded:
            raise RuntimeError("Predictor is not loaded. Cannot prepare features.")

        print(f"Preparing features for Lat/Lon: {latitude:.2f}/{longitude:.2f}, Period: {start_dt_utc} to {end_dt_utc}")
        
        feature_cols_from_meta = self.metadata.get('feature_cols')
        est_ghi_col_from_meta = self.metadata.get('est_ghi_col') # e.g., 'ghi_nasa'

        if not feature_cols_from_meta or not est_ghi_col_from_meta:
            raise ValueError("Essential metadata (feature_cols, est_ghi_col) not found in loaded metadata.")

        # 1. Fetch NASA Data
        # This map aligns model feature names with NASAPowerProducts enums/values
        nasa_features = [
            NASAPowerProducts.TEMPERATURE,
            NASAPowerProducts.AEROSOL_OPTICAL_DEPTH_550nm_ADJ,
            NASAPowerProducts.CLOUD_AMOUNT,
            NASAPowerProducts.RELATIVE_HUMIDITY,
            NASAPowerProducts.PRECIPITABLE_WATER,
            NASAPowerProducts.PRECIPITATION_CORRECTED,
            NASAPowerProducts.SURFACE_ROUGHNESS,
            NASAPowerProducts.NORTHERN_WIND,
            NASAPowerProducts.ARIMASS,
            NASAPowerProducts.ZERO_PLANE_DISPLACEMENT,
            NASAPowerProducts.EVAPOTRANSPIRATION_ENERGY,
            NASAPowerProducts.PLANETARY_BOUNDARY,
            NASAPowerProducts.TOTAL_COLUMN_OZONE,
            NASAPowerProducts.SURFACE_AIR_DENSITY,
            NASAPowerProducts.EVAPORATION_LAND,
            NASAPowerProducts.SURFACE_SOIL_WETNESS,
            NASAPowerProducts.CLEARNESS_INDEX,
            NASAPowerProducts.TEMPERATURE_RANGE,
            NASAPowerProducts.GHI,
            NASAPowerProducts.DHI,
            NASAPowerProducts.DNI,
            NASAPowerProducts.LONGWAVE_DOWNARD_IRR,
            NASAPowerProducts.SURFACE_PRESSURE,
            NASAPowerProducts.WIND_SPEED,
            NASAPowerProducts.SURFACE_ALBEDO
        ]
        
        
        if nasa_features:
            nasa_fetcher = NASAPowerFetchData()
            nasa_df = self._fetch_nasa_data_in_chunks(
                nasa_fetcher,
                TemporalResolution.DAILY, 
                start_dt_utc, 
                end_dt_utc,
                Point(latitude=latitude, longitude=longitude), 
                nasa_features)

            print(f"NASA data fetched. Shape: {nasa_df.shape}")
        else:
            print("No NASA products identified for fetching based on model features.")



        # 2. Fetch CAMS Data

        cams_model_features_prefixes = ['ghi_cams', 'bhi_cams', 'dhi_cams', 'dni_cams','ghi_clear_cams', 'bhi_clear_cams', 'dhi_clear_cams', 'dni_clear_cams']
        cams_needed = any(f.startswith(tuple(cams_model_features_prefixes)) or f == 'kt_cams' for f in feature_cols_from_meta)
        
        cams_df = pd.DataFrame()
        if cams_needed:
            print("Fetching CAMS data...")
            cams_raw_result = get_cams_data(
                latitude=latitude, longitude=longitude,
                start_date=start_dt_utc.strftime("%Y-%m-%d"), 
                end_date=end_dt_utc.strftime("%Y-%m-%d"),
                email = os.getenv('CAMS_EMAIL'),
                time_step='1d' 
            )
            if cams_raw_result and not cams_raw_result.get('error') and isinstance(cams_raw_result.get('data'), list) and cams_raw_result.get('data'):
                temp_cams_list = []
                for item in cams_raw_result['data']:
                    temp_cams_list.append({
                        "datetime": item.get('timestamp'), 
                        "ghi_cams": item.get('ghi'),       
                        "dhi_cams": item.get('dhi'),
                        "dni_cams": item.get('dni'),
                        "bhi_cams": item.get('bhi'), 
                        "ghi_clear_cams": item.get('ghi_clear'),
                        "dhi_clear_cams": item.get('dhi_clear'),
                        "dni_clear_cams": item.get('dni_clear'),
                        "bhi_clear_cams": item.get('bhi_clear'),
                    })
                cams_df = pd.DataFrame(temp_cams_list)
                if not cams_df.empty and 'datetime' in cams_df.columns:
                    cams_df['datetime'] = pd.to_datetime(cams_df['datetime'])
                    cams_df.set_index('datetime', inplace=True)
                
                if not cams_df.empty:
                    if cams_df.index.tz is None: cams_df = cams_df.tz_localize('UTC')
                    else: cams_df = cams_df.tz_convert('UTC')
 
                    # Unit conversion (Wh/m2 to W/m2 average, or kW if model trained on kW)
                    # Training script divides by 1000.
                    cams_cols_to_convert = [col for col in cams_df.columns if col.endswith('_cams')]
                    for col in cams_cols_to_convert:
                        if col in cams_df: cams_df[col] = pd.to_numeric(cams_df[col], errors='coerce') / 1000.0
                print(f"CAMS data fetched and processed. Shape: {cams_df.shape}")

            elif cams_raw_result and cams_raw_result.get('error'):
                 print(f"Warning: CAMS API Error: {cams_raw_result.get('error')}")
            else:
                print("Warning: CAMS data not fetched or in unexpected format.")
        else:
            print("No CAMS-specific features required by the model.")
        
        # 3. Merge DataFrames
        nasa_df = nasa_df.copy()
        nasa_df.index = pd.to_datetime(nasa_df.index, format="%Y%m%d")

        # 2. Localize NASA times to UTC so they’re timezone-aware
        nasa_df.index = nasa_df.index.tz_localize("UTC")

        # 3. Make sure both indices have the same name
        nasa_df.index.name = "datetime"
        cams_df.index.name = "datetime"

        # 4. Now do your outer merge
        merged_df = pd.merge(
            nasa_df, cams_df,
            left_index=True, right_index=True,
            how="outer"
        )

        # 4. Feature Engineering (Must match training script `preprocess_data` and subsequent steps)
        # Ensure index is datetime (should be from reindex)
        if not isinstance(merged_df.index, pd.DatetimeIndex):
            merged_df.index = pd.to_datetime(merged_df.index)
            if merged_df.index.tz is None: merged_df.index = merged_df.index.tz_localize('UTC')
            else: merged_df.index = merged_df.index.tz_convert('UTC')


        merged_df['day_of_year'] = merged_df.index.dayofyear
        merged_df['dayofyear_sin'] = np.sin(2 * np.pi * merged_df['day_of_year'] / 365.25)
        merged_df['dayofyear_cos'] = np.cos(2 * np.pi * merged_df['day_of_year'] / 365.25)
        merged_df['Month'] = merged_df.index.month
        merged_df['longitude'] = longitude

        # Engineer kt_cams (if CAMS data is available and columns exist)
        if 'ghi_cams' in merged_df.columns and 'ghi_clear_cams' in merged_df.columns:
            merged_df['kt_cams'] = np.where(
                pd.to_numeric(merged_df['ghi_clear_cams'], errors='coerce') > 1e-6,
                pd.to_numeric(merged_df['ghi_cams'], errors='coerce') / pd.to_numeric(merged_df['ghi_clear_cams'], errors='coerce'),
                0
            ).clip(0, 1.2)
        elif 'kt_cams' in feature_cols_from_meta: merged_df['kt_cams'] = np.nan

        # Engineer kt_nasa (est_ghi_col_from_meta is 'ghi_nasa', clear_ghi_nasa is 'clear_ghi_nasa')
        if est_ghi_col_from_meta in merged_df.columns and 'clear_ghi_nasa' in merged_df.columns:
            merged_df['kt_nasa'] = np.where(
                pd.to_numeric(merged_df['clear_ghi_nasa'], errors='coerce') > 1e-6,
                pd.to_numeric(merged_df[est_ghi_col_from_meta], errors='coerce') / pd.to_numeric(merged_df['clear_ghi_nasa'], errors='coerce'),
                0
            ).clip(0, 1.2)
        elif 'kt_nasa' in feature_cols_from_meta: merged_df['kt_nasa'] = np.nan
        
        # --- User Action Required: Altitude ---
        if 'altitude' in feature_cols_from_meta:
            # Replace this with actual altitude lookup for (latitude, longitude)
            # e.g., using a DEM library or a pre-computed lookup table.
            actual_altitude = 1200 # Dummy value
            merged_df['altitude'] = actual_altitude 
            if actual_altitude == 1200: # Check if it's still the dummy
                 print(f"Warning: Using DUMMY altitude: {actual_altitude}m. Replace with actual lookup.")
        
        # Ensure all model features and the est_ghi_col are present before returning
        all_needed_cols = list(set(feature_cols_from_meta + [est_ghi_col_from_meta])) # Unique columns
        
        missing_final_cols = [col for col in all_needed_cols if col not in merged_df.columns]
        if missing_final_cols:
            print(f"Warning: After all processing, the following required columns are STILL missing: {missing_final_cols}")
            print("These will be filled with NaN, which will likely cause issues if they are features for the model.")
            for mc in missing_final_cols:
                merged_df[mc] = np.nan
        
        return merged_df[all_needed_cols]

    def predict_ghi(self, latitude, longitude, start_date_str, end_date_str):
        """
        Predicts corrected GHI for a given location and time period.

        Args:
            latitude (float): Latitude of the location.
            longitude (float): Longitude of the location.
            start_date_str (str): Start date ('YYYY-MM-DD' or 'YYYY-MM-DD HH:MM:SS').
            end_date_str (str): End date ('YYYY-MM-DD' or 'YYYY-MM-DD HH:MM:SS').

        Returns:
            pd.Series: Corrected GHI values, or an empty Series if prediction fails.
        """
        if not self.is_loaded:
            raise RuntimeError("Model artifacts not loaded. Initialize GHIPredictor correctly.")

        try:
            # Parse dates and ensure they are timezone-aware (UTC)
            try:
                start_dt_utc = pd.to_datetime(start_date_str)
                if start_dt_utc.tzinfo is None: start_dt_utc = start_dt_utc.tz_localize('UTC')
                else: start_dt_utc = start_dt_utc.tz_convert('UTC')

                end_dt_utc = pd.to_datetime(end_date_str)
                if end_dt_utc.tzinfo is None: end_dt_utc = end_dt_utc.tz_localize('UTC')
                else: end_dt_utc = end_dt_utc.tz_convert('UTC')
            except ValueError: # Fallback for "YYYY-MM-DD"
                start_dt_utc = datetime.strptime(start_date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
                # For daily, ensure end_date covers the full day for range operations
                temp_end_dt = datetime.strptime(end_date_str, "%Y-%m-%d")
                end_dt_utc = datetime(temp_end_dt.year, temp_end_dt.month, temp_end_dt.day, 23, 59, 59, tzinfo=timezone.utc)

        except Exception as e:
            print(f"Error parsing input dates ('{start_date_str}', '{end_date_str}'): {e}")
            return pd.Series(dtype=float, name='corrected_ghi')

        df_prepared = self._prepare_features_for_prediction(latitude, longitude, start_dt_utc, end_dt_utc)

        print(df_prepared)

        if df_prepared.empty:
            print("Feature preparation resulted in an empty DataFrame. Cannot predict.")
            return pd.Series(dtype=float, name='corrected_ghi')

        feature_cols = self.metadata['feature_cols']
        est_ghi_col = self.metadata['est_ghi_col']
        
        # Ensure all feature columns and est_ghi_col are actually in df_prepared
        missing_in_prepared = [col for col in feature_cols + [est_ghi_col] if col not in df_prepared.columns]
        if missing_in_prepared:
            print(f"Error: DataFrame prepared for prediction is missing critical columns: {missing_in_prepared}")
            return pd.Series(np.nan, index=df_prepared.index, name='corrected_ghi')

        X_predict_df = df_prepared[feature_cols].copy() # Use .copy() to avoid SettingWithCopyWarning
        original_satellite_ghi = df_prepared[est_ghi_col].copy()

        print(X_predict_df)

        # Handle rows with NaNs in features before scaling/prediction
        # Convert to numeric, coercing errors, then check for nulls
        for col in X_predict_df.columns:
            X_predict_df[col] = pd.to_numeric(X_predict_df[col], errors='coerce')
        
        nan_in_features_mask = X_predict_df.isnull().any(axis=1)
        
        # Store the original full index for reindexing later
        original_full_index = df_prepared.index
        
        X_predict_clean = X_predict_df[~nan_in_features_mask]

        print(X_predict_clean)
        
        if X_predict_clean.empty:
            print("No data available for prediction after removing rows with NaN features.")
            return pd.Series(np.nan, index=original_full_index, name='corrected_ghi')

        if self.scaler:
            try:
                X_scaled = self.scaler.transform(X_predict_clean)
            except Exception as e:
                print(f"Error during scaling: {e}. Check feature consistency.")
                # Fallback: return NaNs for all, aligned with original index
                return pd.Series(np.nan, index=original_full_index, name='corrected_ghi')
        else:
            X_scaled = X_predict_clean.values # .values for numpy array

        try:
            predicted_bias_values = self.model.predict(X_scaled)
        except Exception as e:
            print(f"Error during model prediction: {e}")
            return pd.Series(np.nan, index=original_full_index, name='corrected_ghi')
        
        predicted_bias_series = pd.Series(predicted_bias_values, index=X_predict_clean.index)
        
        # Add bias only to the non-NaN satellite GHI values that had features for prediction
        # Ensure original_satellite_ghi is numeric for addition
        original_satellite_ghi_clean = pd.to_numeric(original_satellite_ghi[~nan_in_features_mask], errors='coerce')
        
        # Perform addition where both series are valid
        corrected_ghi_calculated = original_satellite_ghi_clean + predicted_bias_series
        
        # Reindex to the full original index, filling NaNs where prediction wasn't possible
        corrected_ghi_final = corrected_ghi_calculated.reindex(original_full_index)
        corrected_ghi_final.name = 'corrected_ghi'
        
        num_predicted = corrected_ghi_final.notna().sum()
        num_total = len(corrected_ghi_final)
        if num_predicted < num_total:
            print(f"Warning: Predictions generated for {num_predicted}/{num_total} timestamps. Others are NaN due to missing inputs or feature NaNs.")

        return corrected_ghi_final

# --- Main Execution Example ---
if __name__ == '__main__':
    print("--- Running GHI Correction Model Prediction Script ---")

    # --- User Configuration ---
    # IMPORTANT: Set this to the directory where your .joblib files are stored.
    # Example: If files are in './RF_MODEL/', set to './RF_MODEL'
    # If files are in the same directory as this script, set to '.'
    MODEL_ARTIFACTS_DIR = './RF_MODEL'  # Or './all_daily_model' etc.
    MODEL_TYPE_VARIANT = 'random_forest' # e.g., 'random_forest', 'xgboost' (must match filenames)
    # --- End User Configuration ---

    example_latitude = 0.31    # Kampala
    example_longitude = 32.58
    # Example: Predict for a few hours of a single day (assuming hourly model)
    example_start_date = "2023-02-1 " # UTC
    example_end_date = "2023-02-12 "   # UTC (inclusive of 05:00)
    
    # If your model is daily, use date strings like:
    # example_start_date = "2023-02-10"
    # example_end_date = "2023-02-10" # For a single day prediction

    print(f"\nAttempting to predict GHI for Lat: {example_latitude}, Lon: {example_longitude}")
    print(f"Period: {example_start_date} to {example_end_date}")
    print(f"Using model from: {MODEL_ARTIFACTS_DIR} (Type: {MODEL_TYPE_VARIANT})")

    try:
        predictor = GHIPredictor(model_base_dir=MODEL_ARTIFACTS_DIR, model_type=MODEL_TYPE_VARIANT)
        
        if predictor.is_loaded:
            corrected_ghi_results = predictor.predict_ghi(
                example_latitude,
                example_longitude,
                example_start_date,
                example_end_date
            )

            if corrected_ghi_results is not None and not corrected_ghi_results.empty:
                print("\n--- Corrected GHI Predictions (W/m^2 average for each period) ---")
                print(corrected_ghi_results)
                print(f"\nNumber of predicted points: {corrected_ghi_results.notna().sum()} / {len(corrected_ghi_results)}")
            else:
                print("\nNo GHI predictions were generated (results were None or empty).")
        else:
            print("GHIPredictor did not load successfully. Cannot make predictions.")

    except FileNotFoundError as e:
        print(f"CRITICAL ERROR: A required model file was not found: {e}")
        print(f"Please verify MODEL_ARTIFACTS_DIR ('{MODEL_ARTIFACTS_DIR}') and MODEL_TYPE_VARIANT ('{MODEL_TYPE_VARIANT}') are correct,")
        print("and that the model artifacts (e.g., random_forest_model.joblib, etc.) exist in that directory.")
    except Exception as e:
        print(f"An unexpected error occurred during the prediction process: {e}")
        traceback.print_exc()

    print("\n--- Prediction Script Finished ---")
