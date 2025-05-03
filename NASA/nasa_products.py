from enum import Enum 


class NASAPowerProducts(Enum):
    GHI = 'ALLSKY_SFC_SW_DWN' #Global Horizontal Irradiance
    DHI = 'ALLSKY_SFC_SW_DIFF' #Direct Horizontal Irradiance
    GTI = '' #Global Tilted Irradiance
    DNI = 'ALLSKY_SFC_SW_DNI' #Direct Normal Irradiance

    TEMPERATURE = 'T2M'
    SPECIFIC_HUMIDITY = 'QV2M'
    AEROSOL_OPTICAL_DEPTH_550nm = 'AOD_55'
    RELATIVE_HUMIDITY = 'RH2M'
    SURFACE_PRESSURE = 'PS'
    AEROSOL_OPTICAL_DEPTH_840nm = 'AOD_84'
    CLOUD_VISIBLE_OPTICAL_DEPTH = 'CLOUD_OD'
    CLOUD_AMOUNT = 'CLOUD_AMT_DAY'
    TOTAL_COLUMN_OZONE = 'TO3'
    SURFACE_ALBEDO = 'SRF_ALB_ADJ'
    ALL_SKY_SURFACE_ALBEDO = 'ALLSKY_SRF_ALB'
    CLEAR_SKY_ALBEDO = 'CLRSKY_SRF_ALB'
    PRECIPITABLE_WATER = 'PW'
    SOLAR_ZENITH_ANGLE = 'SZA'

class TemporalResolution(Enum):
    DAILY = 'daily'
    MONTHLY = 'monthly'
    HOURLY = 'hourly'



