import pandas as pd
import pvlib
from datetime import datetime

def get_cams_data(latitude, longitude, start_date, end_date, email, time_step):
    """Fetch CAMS radiation data and return processed DataFrame"""
    try:
        # Get raw data
        raw_df, metadata = pvlib.iotools.get_cams(
            latitude=latitude,
            longitude=longitude,
            start=start_date,
            end=end_date,
            email=email,
            time_step=time_step,
            timeout=180,
            identifier='cams_radiation'
        )
        
     
        processed_df = raw_df.reset_index().rename(columns={'index': 'timestamp'})
        processed_df['timestamp'] = processed_df['timestamp'].dt.strftime('%Y-%m-%dT%H:%M:%SZ')
        
        return {
            'data': processed_df.to_dict(orient='records'),
            'columns': list(processed_df.columns),
            'metadata': metadata,
            'error': None
        }
        
    except Exception as e:
        return {'data': None, 'columns': None, 'metadata': None, 'error': str(e)}
