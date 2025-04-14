import numpy as np
import datetime
from typing import Dict, List
from math import modf
import pandas as pd

class SolarIrradianceCalculator:
    """
    A class to calculate extraterrestrial solar irradiance using Spencer's formula.
    
    Parameters:
    latitude (float): Geographic latitude in degrees (-90 to 90)
    longitude (float): Geographic longitude in degrees (-180 to 180)
    date (datetime): Date and time for calculation
    
    Methods:
    extraterrestrial_irradiance(): Returns calculated irradiance in W/m²
    """
    
    SOLAR_CONSTANT = 1367  # W/m²

    def __init__(self, latitude: float, longitude: float, date: datetime.datetime):
        self._validate_coordinates(latitude, longitude)
        self._validate_datetime(date)
        
        self.latitude = float(latitude)
        self.longitude = float(longitude)
        self.date = date
        self._cache = {}  # For memoization

    def _validate_coordinates(self, lat: float, lon: float):
        """Validate geographic coordinates"""
        if not (-90 <= lat <= 90):
            raise ValueError(f"Invalid latitude: {lat}. Must be between -90 and 90 degrees.")
        if not (-180 <= lon <= 180):
            raise ValueError(f"Invalid longitude: {lon}. Must be between -180 and 180 degrees.")

    def _validate_datetime(self, dt: datetime.datetime):
        """Validate datetime object"""
        if not isinstance(dt, datetime.datetime):
            raise TypeError("date must be a datetime.datetime object")

    @property
    def day_of_year(self) -> int:
        """Day of year (1-366) with memoization"""
        if 'doy' not in self._cache:
            self._cache['doy'] = self.date.timetuple().tm_yday
        return self._cache['doy']

    @property
    def solar_declination(self) -> float:
        """Solar declination in degrees using Cooper's formula"""
        return 23.45 * np.sin(np.deg2rad(360 * (284 + self.day_of_year) / 365))

    @property
    def hour_angle(self) -> float:
        """Solar hour angle in degrees"""
        return 15 * (self.solar_time - 12)

    @property
    def solar_time(self) -> float:
        """Local solar time in hours"""
        B = np.deg2rad((self.day_of_year - 1) * 360 / 365)
        equation_of_time = 9.87 * np.cos(2*B) - 7.53 * np.sin(B) - 1.5 * np.sin(B)
        
        # Calculate decimal hours with fractional minutes
        hours = self.date.hour + self.date.minute/60 + self.date.second/3600
        
        return (hours + equation_of_time/60 + self.longitude/15) % 24

    @property
    def elevation_angle(self) -> float:
        """Solar elevation angle in degrees"""
        lat_rad = np.deg2rad(self.latitude)
        decl_rad = np.deg2rad(self.solar_declination)
        ha_rad = np.deg2rad(self.hour_angle)

        sin_elevation = (np.sin(decl_rad) * np.sin(lat_rad) +
                        np.cos(decl_rad) * np.cos(lat_rad) * np.cos(ha_rad))
        
        return np.rad2deg(np.arcsin(sin_elevation))

    def extraterrestrial_irradiance(self) -> float:
        """
        Calculate extraterrestrial irradiance using Spencer's formula
        
        Returns:
        float: Irradiance in W/m² (0 when sun is below horizon)
        """
        try:
            if self.elevation_angle <= 0:
                return 0.0

            B = np.deg2rad((self.day_of_year - 1) * 360 / 365)
            correction_factor = (
                1.000110 + 
                0.034221 * np.cos(B) + 
                0.001280 * np.sin(B) + 
                0.000719 * np.cos(2*B) + 
                0.000077 * np.sin(2*B)
            )

            irradiance = self.SOLAR_CONSTANT * correction_factor * np.sin(np.deg2rad(self.elevation_angle))
            return max(0.0, round(irradiance, 2))

        except Exception as e:
            print(f"Calculation error: {str(e)}")
            return 0.0


    def generate_hourly_series(self, start_date: datetime.datetime, end_date: datetime.datetime) -> List[Dict]:
        """
        Generate hourly extraterrestrial irradiance values between two dates

        Args:
            start_date: Start datetime (inclusive)
            end_date: End datetime (inclusive)

        Returns:
            List of dictionaries with 'datetime' and 'irradiance' keys
            """
        hourly_data = []
        current = start_date
        delta = datetime.timedelta(hours=1)

        while current <= end_date:
            model = SolarIrradianceCalculator(
                self.latitude,
                self.longitude,
                current
            )
            hourly_data.append({
                'datetime': current,
                'irradiance': model.extraterrestrial_irradiance()
            })
            current += delta

        return hourly_data

    def resample_daily(self, hourly_data: List[Dict]) -> List[Dict]:
        """
        Resample hourly data to daily averages

        Args:
            hourly_data: Output from generate_hourly_series()

        """
        df = pd.DataFrame(hourly_data)
        df['datetime'] = pd.to_datetime(df['datetime'])
        df.set_index('datetime', inplace=True)

        daily = df.resample('D').sum().reset_index()
        daily['datetime'] = daily['datetime'].dt.date

        return daily[['datetime', 'irradiance']].to_dict('records')

    def resample_monthly(self, hourly_data: List[Dict]) -> List[Dict]:
        """
        Resample hourly data to monthly averages

        Args:
            hourly_data: Output from generate_hourly_series()

        """
        df = pd.DataFrame(hourly_data)
        df['datetime'] = pd.to_datetime(df['datetime'])
        df.set_index('datetime', inplace=True)

        monthly = df.resample('ME').sum().reset_index()
        monthly['year'] = monthly['datetime'].dt.year
        monthly['month'] = monthly['datetime'].dt.month

        return monthly[['year', 'month', 'irradiance']].to_dict('records')
