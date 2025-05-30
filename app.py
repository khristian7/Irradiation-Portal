from flask import Flask, render_template, request, jsonify, send_file
from datetime import datetime, timezone
import pandas as pd
import numpy as np
import csv
import io
import json
from model import SolarIrradianceCalculator
import traceback
from geopy import Point


from NASA import NASAPowerFetchData, NASAPowerProducts, TemporalResolution
from CAMS import get_cams_data
from rf_model import GHIPredictor
import os

app = Flask(__name__)


@app.route('/')
def home():
    return render_template('home.html', datetime=datetime)


@app.route('/portal')
def index():
    return render_template('portal.html', current_date=datetime.now().strftime("%Y-%m-%d"))


@app.route('/documentation')
def documentation():
    return render_template('documentation.html')


@app.route('/help')
def help():
    return render_template('help.html')


@app.route('/api/model', methods=['POST'])
def fetch_model_data():
    """Fetch solar irradiance data from the custom model."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid JSON payload"}), 400

    mode = data.get('mode')
    latitude = data.get('latitude')
    longitude = data.get('longitude')

    if latitude is None or longitude is None:
        return jsonify({"error": "Missing latitude or longitude"}), 400

    try:
        latitude = float(latitude)
        longitude = float(longitude)
        if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
            raise ValueError("Invalid coordinate range")
    except ValueError as e:
        return jsonify({"error": f"Invalid latitude/longitude: {e}"}), 400

    if mode == 'year':
        start_year_str = data.get('startyear')
        end_year_str = data.get('endyear')

        if not start_year_str or not end_year_str:
            return jsonify({"error": "Missing startyear or endyear for 'year' mode"}), 400
        try:
            start_year = int(start_year_str)
            end_year = int(end_year_str)
            # Add reasonable year validation if needed, e.g.,
            # if not (1900 < start_year < 2100 and 1900 < end_year < 2100 and start_year <= end_year):
            #     raise ValueError("Invalid year range")
        except ValueError:
            return jsonify({"error": "Invalid year format"}), 400

        start_date_str = f"{start_year}-01-01"
        end_date_str = f"{end_year}-12-31"

        try:
            start_date = datetime.strptime(start_date_str, "%Y-%m-%d")
            end_date = datetime.strptime(end_date_str, "%Y-%m-%d")
        except ValueError:
            return jsonify({"error": "Internal error generating dates from years"}), 500

        # start_date might not be used by constructor
        model = SolarIrradianceCalculator(latitude, longitude, start_date)
        hourly_series = model.generate_hourly_series(
            start_date, end_date)  # Pass actual start_date

        # Assuming meanGHI returns a list of dicts with 'datetime', 'mean', 'upper', 'lower'
        # And 'datetime' is already a string or datetime object that avgChart can handle (e.g., month name)
        # Or 'M' if that's what frontend expects for year mode labels
        raw_stats = model.meanGHI(pd.DataFrame(hourly_series), resample='D')

        stats_list = pd.DataFrame(raw_stats).replace(
            {np.nan: None}).to_dict(orient='records')

        return jsonify({
            "latitude":   latitude,
            "longitude":  longitude,
            "start_date": start_date_str,  # For consistency, though start/end year were inputs
            "end_date":   end_date_str,
            "num_points": len(stats_list),
            # Expected by avgChart: [{datetime (label), mean, upper, lower}, ...]
            "data":       stats_list,
        })

    elif mode == 'date':
        start_date_str = data.get('startDate')
        end_date_str = data.get('endDate')
        time_granularity = data.get('timeGranularity', 'Daily')

        if not start_date_str or not end_date_str:
            return jsonify({"error": "Invalid or missing start/end date for 'date' mode"}), 400

        try:
            start_date = datetime.strptime(start_date_str, "%Y-%m-%d")
            end_date = datetime.strptime(end_date_str, "%Y-%m-%d")
            if end_date < start_date:
                return jsonify({"error": "End date cannot be before start date"}), 400
        except ValueError:
            return jsonify({"error": "Dates must be in YYYY-MM-DD format"}), 400

        # start_date might not be used by constructor
        model = SolarIrradianceCalculator(latitude, longitude, start_date)
        hourly_series = model.generate_hourly_series(start_date, end_date)

        results = []
        if time_granularity == 'Hourly':
            series_to_process = hourly_series  # Already hourly
            for h in series_to_process:
                results.append({
                    "datetime": h['datetime'].isoformat() if isinstance(h['datetime'], datetime) else h['datetime'],
                    "GHI": h.get('irradiance'),  # Use .get for safety
                    "DHI": None,
                    "DNI": None
                })
        elif time_granularity == 'Daily':
            daily_series = model.resample_daily(hourly_series)
            for d in daily_series:
                results.append({
                    "datetime": d['datetime'].isoformat() if isinstance(d['datetime'], datetime) else d['datetime'],
                    "GHI": d.get('irradiance'),
                    "DHI": None,
                    "DNI": None
                })
        elif time_granularity == 'Monthly':
            monthly_series = model.resample_monthly(hourly_series)
            for m in monthly_series:
                # Construct a datetime object for the first day of the month
                month_dt = datetime(int(m['year']), int(
                    m['month']), 1, tzinfo=timezone.utc)
                results.append({
                    "datetime": month_dt.isoformat(),
                    "GHI": m.get('irradiance'),
                    "DHI": None,
                    "DNI": None
                })
        else:
            return jsonify({"error": "Invalid timeGranularity for 'date' mode"}), 400

        return jsonify({
            "latitude": latitude,
            "longitude": longitude,
            "start_date": start_date_str,
            "end_date": end_date_str,
            "time_granularity": time_granularity,
            "num_points": len(results),
            # Standardized data: [{"datetime":..., "GHI":..., "DHI":null, "DNI":null}, ...]
            "data": results,
        })
    else:
        return jsonify({"error": "Invalid mode selected"}), 400


@app.route('/api/cams', methods=['POST'])
def handle_cams_request():
    """Handles requests to the CAMS data API."""
    try:
        request_data = request.get_json()
        if not request_data:
            return jsonify({"error": "Invalid JSON payload"}), 400

        required_fields = ['latitude', 'longitude',
                           'startDate', 'endDate', 'mode']
        for field in required_fields:
            if field not in request_data:
                return jsonify({"error": f"Missing required field: {field}"}), 400

        # CAMS typically provides time series, so 'mode' should usually be 'date'
        if request_data['mode'] != 'date':
            return jsonify({"error": "CAMS API currently only supports 'date' mode for time series."}), 400

        params = {
            'latitude': float(request_data['latitude']),
            'longitude': float(request_data['longitude']),
            'start_date': request_data['startDate'],
            'end_date': request_data['endDate'],
            'time_step': request_data.get('timeGranularity', 'Hourly'),
            'email': os.getenv('CAMS_EMAIL', 'default@example.com')
        }

        # Map frontend timeGranularity to CAMS expected time_step if necessary
        cams_time_step_map = {
            "Hourly": "1h",
            "Daily": "1d",
            "Monthly": "1M"
        }
        params['time_step'] = cams_time_step_map.get(
            request_data.get('timeGranularity', 'Hourly'), '1h')

        if not (-90 <= params['latitude'] <= 90) or not (-180 <= params['longitude'] <= 180):
            return jsonify({"error": "Invalid coordinates"}), 400

        # Validate dates
        datetime.strptime(params['start_date'], "%Y-%m-%d")
        datetime.strptime(params['end_date'], "%Y-%m-%d")

        # Get data from CAMS service
        # Assuming get_cams_data returns a dict like:
        # {'error': None, 'data': [{'timestamp': '...', 'ghi': ..., 'dhi': ..., 'dni': ...}, ...], 'metadata': ...}
        cams_result = get_cams_data(**params)

        if cams_result.get('error'):
            return jsonify({"error": f"CAMS API Error: {cams_result['error']}"}), 500

        if not cams_result.get('data') or not isinstance(cams_result['data'], list):
            return jsonify({"error": "CAMS API returned no data or invalid data format"}), 500

        # Standardize the output for the frontend
        formatted_data = []
        for item in cams_result['data']:
            formatted_data.append({
                # Assuming CAMS 'timestamp' is ISO string
                "datetime": item.get('timestamp'),
                "GHI": item.get('ghi'),
                "DHI": item.get('dhi'),
                "DNI": item.get('dni')
            })

        return jsonify({
            "latitude": params['latitude'],
            "longitude": params['longitude'],
            "start_date": params['start_date'],
            "end_date": params['end_date'],
            "time_granularity": request_data.get('timeGranularity', 'Hourly'),
            "num_points": len(formatted_data),
            "data": formatted_data,  # Standardized data
            # Optional: pass along CAMS specific metadata
            "metadata_cams": cams_result.get('metadata')
        })

    except ValueError as e:
        return jsonify({"error": f"Invalid parameter format: {str(e)}"}), 400
    except Exception as e:
        app.logger.error(f"CAMS API request error: {
                         str(e)}\n{traceback.format_exc()}")
        return jsonify({"error": f"Server error processing CAMS request: {str(e)}"}), 500


@app.route('/api/nasa', methods=['POST'])
def handle_nasa_request():
    """
    Handles requests to the NASA POWER API.
    """
    try:
        request_data = request.get_json()
        if not request_data:
            return jsonify({"error": "Invalid JSON payload"}), 400

        required_fields = ['latitude', 'longitude',
                           'startDate', 'endDate', 'mode']
        for field in required_fields:
            if field not in request_data:
                return jsonify({"error": f"Missing required field: {field}"}), 400

        # NASA POWER API typically provides time series, so 'mode' should usually be 'date'
        if request_data['mode'] != 'date':
            return jsonify({"error": "NASA API currently only supports 'date' mode for time series."}), 400

        start_date_str = request_data['startDate']
        end_date_str = request_data['endDate']

        try:
            start_date = datetime.strptime(start_date_str, "%Y-%m-%d")
            end_date = datetime.strptime(end_date_str, "%Y-%m-%d")
            if end_date < start_date:
                return jsonify({"error": "End date cannot be before start date"}), 400
        except ValueError:
            return jsonify({"error": "Dates must be in YYYY-MM-DD format"}), 400

        location = Point(
            latitude=float(request_data['latitude']),
            longitude=float(request_data['longitude'])
        )
        if not (-90 <= location.latitude <= 90 and -180 <= location.longitude <= 180):
            return jsonify({"error": "Invalid coordinates"}), 400

        # Determine temporal resolution for NASA API from frontend's timeGranularity
        nasa_temporal_resolution_map = {
            "Hourly": TemporalResolution.HOURLY,
            "Daily": TemporalResolution.DAILY,
            "Monthly": TemporalResolution.MONTHLY
        }
        time_granularity_frontend = request_data.get(
            'timeGranularity', 'Hourly')
        nasa_temporal_res = nasa_temporal_resolution_map.get(
            time_granularity_frontend)

        if not nasa_temporal_res:
            return jsonify({"error": f"Unsupported timeGranularity for NASA: {time_granularity_frontend}"}), 400

        nasa_data_fetcher = NASAPowerFetchData()

        # Fetch GHI, DHI, DNI. NASAPowerProducts should map to API parameter names.
        nasa_api_result = nasa_data_fetcher.fetch_multiple_parameters(
            temporal_resolution=nasa_temporal_res,
            start_date=start_date,  # Pass datetime objects
            end_date=end_date,     # Pass datetime objects
            location=location,
            products=[
                NASAPowerProducts.GHI,
                NASAPowerProducts.DHI,
                NASAPowerProducts.DNI
            ]
        )

        # Create a DataFrame from the Series dictionary
        df = pd.DataFrame(nasa_api_result)

        # Rename columns to GHI, DHI, DNI based on NASAPowerProducts mapping if necessary
        column_mapping = {
            NASAPowerProducts.GHI.value if hasattr(NASAPowerProducts.GHI, 'value') else 'ALLSKY_SFC_SW_DWN': 'GHI',
            NASAPowerProducts.DHI.value if hasattr(NASAPowerProducts.DHI, 'value') else 'ALLSKY_SFC_SW_DIFF': 'DHI',
            NASAPowerProducts.DNI.value if hasattr(NASAPowerProducts.DNI, 'value') else 'ALLSKY_SFC_SW_DNI': 'DNI',
        }
        df.rename(columns=column_mapping, inplace=True)

        # Handle missing data (NASA uses -999)
        # Replace with None (becomes null in JSON)
        df.replace({-999.0: None, -999: None}, inplace=True)

        # Reset index to make datetime a column
        df.index.name = 'datetime_pd'  # Name the index before resetting
        df.reset_index(inplace=True)

        try:
            df['datetime_pd'] = pd.to_datetime(
                df['datetime_pd'])  # Attempt automatic parsing
        except Exception as e:
            app.logger.error(
                f"Error converting NASA datetime strings to Timestamp objects: {e}")

        # Convert pandas Timestamp to ISO 8601 string
        # Now that df['datetime_pd'] should contain Timestamp objects, this should work.
        df['datetime'] = df['datetime_pd'].apply(lambda x: pd.to_datetime(
            x,  format='%Y%m%d%H').isoformat() if pd.notnull(x) else None)

        # Select only the required columns for the final output
        output_columns = ['datetime', 'GHI', 'DHI', 'DNI']
        # Filter out columns not present in the DataFrame (e.g., if DNI wasn't fetched or available)
        final_columns = [col for col in output_columns if col in df.columns]

        # Ensure GHI, DHI, DNI columns exist, if not, add them with None
        for col in ['GHI', 'DHI', 'DNI']:
            if col not in df.columns:
                df[col] = None
                if col not in final_columns:
                    final_columns.append(col)

        formatted_data = df[final_columns].to_dict(orient='records')

        return jsonify({
            "latitude":   location.latitude,
            "longitude":  location.longitude,
            "time_granularity": time_granularity_frontend,
            "start_date": start_date_str,
            "end_date":   end_date_str,
            "num_points": len(formatted_data),
            "data":       formatted_data,
        })

    except ValueError as e:
        return jsonify({"error": f"Invalid parameter format: {str(e)}"}), 400
    except AttributeError as e_attr:  # Catch attribute errors specifically if needed
        app.logger.error(f"NASA API request AttributeError: {
                         str(e_attr)}\n{traceback.format_exc()}")
        return jsonify({"error": f"Data processing error for NASA data: {str(e_attr)}"}), 500
    except Exception as e:
        app.logger.error(f"NASA API request error: {
                         str(e)}\n{traceback.format_exc()}")
        return jsonify({"error": f"Server error processing NASA request: {str(e)}"}), 500


# @app.route('/api/rf', method=['POST'])
# def run_rf():
#     """
#     Runs Random Forest model
#     """
#     pass
#

@app.route('/api/export', methods=['POST'])
def export_data():
    """Exports data in CSV or JSON format."""
    try:
        format_type = request.args.get('format', 'CSV').upper()
        request_data = request.get_json()

        if not request_data:
            return jsonify({"error": "Invalid JSON payload for export"}), 400

        if format_type not in ['CSV', 'JSON']:
            return jsonify({"error": "Unsupported format for export"}), 400

        # Reuse the data fetching logic based on dataSource
        # This requires dataSource to be part of the request_data for export
        data_source = request_data.get('dataSource')
        if not data_source:
            return jsonify({"error": "dataSource is required for export"}), 400

        # Simulate a fetch call to get the standardized data
        # We need to ensure the parameters for each API are correctly passed
        # For simplicity, this example assumes the frontend sends all necessary params
        # for the selected dataSource. A more robust solution might call the
        # respective /api/<dataSource> endpoint internally or refactor data fetching.

        fetched_api_response = {}
        # This is a simplified way; ideally, you'd refactor data fetching into common functions.
        if data_source == "model":
            # Slightly risky to call another endpoint like this, but for demonstration:
            # Consider refactoring the core logic of fetch_model_data into a helper.
            # For now, we'll assume the export request has all params fetch_model_data needs.
            # This part needs careful implementation to avoid re-validating etc.
            # Let's assume we get the data directly for now.
            # This section would need to replicate the logic of fetch_model_data
            # or call a refactored internal function.
            # For this example, we'll just show the structure.
            # This is a placeholder for actual data retrieval logic.
            return jsonify({"error": "Export for 'model' data needs refactoring to reuse data fetching logic."}), 500

        elif data_source == "CAMS_RAD":
            # Placeholder - replicate CAMS data fetching logic or call refactored function
            # For now, assume `handle_cams_request` could be refactored to return data internally
            return jsonify({"error": "Export for 'CAMS_RAD' data needs refactoring."}), 500

        elif data_source == "NASA":
            # Placeholder - replicate NASA data fetching logic or call refactored function
            return jsonify({"error": "Export for 'NASA' data needs refactoring."}), 500
        else:
            return jsonify({"error": "Invalid dataSource for export"}), 400

        # --- The following export logic assumes `api_data_points` is populated correctly ---
        # --- with the standardized list of {"datetime", "GHI", "DHI", "DNI"} dicts ---
        # --- You MUST replace the above placeholder sections with actual data fetching ---
        # --- For example, by refactoring the core logic of your /api/model, /api/cams, /api/nasa routes ---
        # --- into helper functions that can be called by both the API routes and this export route. ---

        # Let's assume `api_data_points` is now a list of dicts like:
        # api_data_points = [{"datetime": "...", "GHI": ..., "DHI": ..., "DNI": ...}, ...]
        # This part is CRITICAL and is currently NOT fully implemented above.

        # For demonstration, let's create dummy api_data_points if the above isn't implemented
        # REMOVE THIS DUMMY DATA ONCE ACTUAL FETCHING IS IN PLACE FOR EXPORT
        if 'api_data_points' not in locals():  # Check if it was populated by (currently missing) logic
            # This is a fallback if the above data source logic isn't filled yet for export
            # You should replace this with actual data fetching based on dataSource
            # For example, by calling the refactored data fetching functions.
            # This is just to make the export function runnable with dummy data.
            # Only proceed if it's date mode for this dummy
            if request_data.get("mode") == "date":
                api_data_points = [{
                    "datetime": datetime.now(timezone.utc).isoformat(),
                    "GHI": 100, "DHI": 50, "DNI": 800
                }]
            else:  # Year mode export would also need its specific data structure
                return jsonify({"error": "Export logic for 'year' mode data structure not shown in this dummy example."}), 500

        if not api_data_points:
            return jsonify({"error": "No data to export or data fetching for export failed"}), 500

        # Prepare export data (flattened for CSV)
        export_list = []
        for entry in api_data_points:
            export_list.append({
                "Timestamp": entry.get('datetime'),
                "GHI (W/m²)": entry.get('GHI'),
                "DHI (W/m²)": entry.get('DHI'),
                "DNI (W/m²)": entry.get('DNI')
            })

        if not export_list:
            return jsonify({"error": "No valid data could be prepared for export"}), 500

        # Generate CSV or JSON
        timestamp_str = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename_base = f"solar_data_{data_source}_{timestamp_str}"

        if format_type == 'CSV':
            output = io.StringIO()
            # Use the keys from the first item as headers, ensures correct order and all keys
            if export_list:
                writer = csv.DictWriter(
                    output, fieldnames=export_list[0].keys())
                writer.writeheader()
                writer.writerows(export_list)

            return send_file(
                io.BytesIO(output.getvalue().encode('utf-8')),
                mimetype='text/csv',
                as_attachment=True,
                download_name=f"{filename_base}.csv"
            )
        else:  # JSON
            return send_file(
                io.BytesIO(json.dumps(api_data_points, indent=2).encode(
                    'utf-8')),  # Export original structure for JSON
                mimetype='application/json',
                as_attachment=True,
                download_name=f"{filename_base}.json"
            )

    except Exception as e:
        app.logger.error(f"Error in export: {str(e)}\n{
                         traceback.format_exc()}")
        return jsonify({"error": f"An unexpected error occurred during export: {str(e)}"}), 500


if __name__ == '__main__':
    app.run(debug=True)
    app.run(debug=True)
