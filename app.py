from flask import Flask, render_template, request, jsonify, send_file
from datetime import datetime, timedelta
import csv
import io
import json
from model import SolarIrradianceCalculator
import traceback
import pandas as pd
from fetch_CAMS_data import get_cams_data 
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
def fetch_data():
    """Fetch solar irradiance data based on user inputs."""
    data = request.get_json()

    # 1. Parse user inputs
    latitude = float(data.get('latitude', 0.0))
    longitude = float(data.get('longitude', 0.0))
    start_date_str = data.get('startDate')
    end_date_str = data.get('endDate')
    time_granularity = data.get('timeGranularity', 'Daily')  # 'Hourly', 'Daily', 'Monthly'
    
    if not start_date_str or not end_date_str:
        return jsonify({"error": "Invalid or missing start/end date"}), 400

    try:
        start_date = datetime.strptime(start_date_str, "%Y-%m-%d")
        end_date = datetime.strptime(end_date_str, "%Y-%m-%d")
    except ValueError:
        return jsonify({"error": "Dates must be in YYYY-MM-DD format"}), 400

    # Ensure end_date >= start_date
    if end_date < start_date:
        return jsonify({"error": "End date cannot be before start date"}), 400

    model = SolarIrradianceCalculator(latitude, longitude, start_date)
    
    if time_granularity == 'Hourly':
        hourly = model.generate_hourly_series(start_date, end_date)
        results = [{
            "datetime": h['datetime'].isoformat(),
            "irradiance": h['irradiance']
        } for h in hourly]

    elif time_granularity == 'Daily':
        hourly = model.generate_hourly_series(start_date, end_date)
        daily = model.resample_daily(hourly)
        results = [{
            "datetime": d['datetime'].isoformat(),
            "irradiance": d['irradiance']
        } for d in daily]

    elif time_granularity == 'Monthly':
        hourly = model.generate_hourly_series(start_date, end_date)
        monthly = model.resample_monthly(hourly)
        results = [{
            "year": m['year'],
            "month": m['month'],
            "irradiance": m['irradiance']
        } for m in monthly]  
    
    else:
        return jsonify({"error": "Invalid time granularity"}), 400

    return jsonify({
        "latitude": latitude,
        "longitude": longitude,
        "start_date": start_date_str,
        "end_date": end_date_str,
        "time_granularity": time_granularity,
        "num_points": len(results),
        "data": results
    })


@app.route('/api/cams', methods=['POST'])
def handle_cams_request():
    try:
        # Get and validate request data
        request_data = request.get_json()
        
        required_fields = ['latitude', 'longitude', 'startDate', 'endDate']
        for field in required_fields:
            if field not in request_data:
                return jsonify({"error": f"Missing required field: {field}"}), 400

        # Extract parameters
        params = {
            'latitude': float(request_data['latitude']),
            'longitude': float(request_data['longitude']),
            'start_date': request_data['startDate'],
            'end_date': request_data['endDate'],
            'time_step': request_data.get('timeStep', '1H'),
            'email': os.getenv('CAMS_EMAIL', 'default@example.com')
        }

        # Validate coordinates
        if not (-90 <= params['latitude'] <= 90) or not (-180 <= params['longitude'] <= 180):
            return jsonify({"error": "Invalid coordinates"}), 400

        # Get data
        result = get_cams_data(**params)
        
        if result['error']:
            return jsonify({"error": result['error']}), 500

        return jsonify({
            "success": True,
            "data": result['data'],
            "columns": result['columns'],
            "metadata": result['metadata'],
            "query": {
                "coordinates": (params['latitude'], params['longitude']),
                "time_range": (params['start_date'], params['end_date'])
            }
        })

    except ValueError as e:
        return jsonify({"error": f"Invalid parameter format: {str(e)}"}), 400
    except Exception as e:
        return jsonify({"error": f"Server error: {str(e)}"}), 500


@app.route('/api/export', methods=['POST'])
def export_data():
    try:
        format_type = request.args.get('format', 'CSV').upper()
        data = request.get_json()
        
        if format_type not in ['CSV', 'JSON']:
            return jsonify({"error": "Unsupported format"}), 400
        
        # Parse and validate user inputs
        latitude = float(data.get('latitude', 0.0))
        longitude = float(data.get('longitude', 0.0))
        start_date_str = data.get('startDate')
        end_date_str = data.get('endDate')
        time_granularity = data.get('timeGranularity', 'Daily')  # Correct parameter name

        if not start_date_str or not end_date_str:
            return jsonify({"error": "Invalid or missing start/end date"}), 400

        try:
            start_date = datetime.strptime(start_date_str, "%Y-%m-%d")
            end_date = datetime.strptime(end_date_str, "%Y-%m-%d")
        except ValueError:
            return jsonify({"error": "Dates must be in YYYY-MM-DD format"}), 400

        if end_date < start_date:
            return jsonify({"error": "End date cannot be before start date"}), 400

        if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
            return jsonify({"error": "Invalid coordinates"}), 400

        model = SolarIrradianceCalculator(latitude, longitude, start_date)
        
        # Generate data using the same logic as fetch_data
        hourly = model.generate_hourly_series(start_date, end_date)
        
        if time_granularity == 'Hourly':
            results = hourly
        elif time_granularity == 'Daily':
            results = model.resample_daily(hourly)
        elif time_granularity == 'Monthly':
            results = model.resample_monthly(hourly)
        else:
            return jsonify({"error": "Invalid time granularity"}), 400

        # Prepare export data
        export_data = []
        if time_granularity in ['Hourly', 'Daily']:
            for entry in results:
                export_data.append({
                    "timestamp": entry['datetime'].isoformat(),
                    "irradiance": entry['irradiance']
                })
        elif time_granularity == 'Monthly':
            for entry in results:
                # Create timestamp for the first day of the month
                timestamp = datetime(year=entry['year'], month=entry['month'], day=1)
                export_data.append({
                    "timestamp": timestamp.isoformat(),
                    "irradiance": entry['irradiance']
                })

        if not export_data:
            return jsonify({"error": "No valid data could be calculated"}), 500
        
        # Generate CSV or JSON
        if format_type == 'CSV':
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow(['Timestamp', 'Irradiance (W/m²)'])
            for entry in export_data:
                writer.writerow([entry['timestamp'], entry['irradiance']])
            
            return send_file(
                io.BytesIO(output.getvalue().encode('utf-8')),
                mimetype='text/csv',
                as_attachment=True,
                download_name=f"solar_data_{datetime.now().strftime('%Y%m%d')}.csv"
            )
        else:  # JSON
            return send_file(
                io.BytesIO(json.dumps(export_data, indent=2).encode('utf-8')),
                mimetype='application/json',
                as_attachment=True,
                download_name=f"solar_data_{datetime.now().strftime('%Y%m%d')}.json"
            )
            
    except Exception as e:
        app.logger.error(f"Error in export: {str(e)}\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)
