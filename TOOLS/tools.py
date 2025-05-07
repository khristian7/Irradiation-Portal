import numpy as np
import pandas as pd 

def meanGHI(df, resample='D'):
    """
    Calculate the mean Global Horizontal Irradiance (GHI) from a DataFrame.
    """
    df['datetime'] = pd.to_datetime(df['datetime'])
    df.set_index('datetime', inplace=True)

    # Resample by calendar day: compute mean and std of the 24 hourly values
    daily_stats = df['Irradiance'].resample(resample).agg(['mean', 'std']).reset_index()

    # compute upper & lower for quick inspection
    daily_stats['upper'] = daily_stats['mean'] + daily_stats['std']
    daily_stats['lower'] = daily_stats['mean'] - daily_stats['std'] 
    return daily_stats
