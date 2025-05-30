from enum import Enum 


class NASAPowerProducts(Enum):

    GHI = 'ALLSKY_SFC_SW_DWN' #Global Horizontal Irradiance
    DHI = 'ALLSKY_SFC_SW_DIFF' #Direct Horizontal Irradiance
    GTI = '' #Global Tilted Irradiance
    DNI = 'ALLSKY_SFC_SW_DNI' #Direct Normal Irradiance
    LONGWAVE_DOWNARD_IRR = 'CLRSKY_SFC_LW_DWN'

    

    TEMPERATURE = 'T2M'
    SPECIFIC_HUMIDITY = 'QV2M'
    AEROSOL_OPTICAL_DEPTH_550nm = 'AOD_55'
    AEROSOL_OPTICAL_DEPTH_550nm_ADJ = 'AOD_55_ADJ'
    RELATIVE_HUMIDITY = 'RH2M'
    SURFACE_PRESSURE = 'PS'
    AEROSOL_OPTICAL_DEPTH_840nm = 'AOD_84'
    CLOUD_VISIBLE_OPTICAL_DEPTH = 'CLOUD_OD'
    CLOUD_AMOUNT_DAT = 'CLOUD_AMT_DAY'
    TOTAL_COLUMN_OZONE = 'TO3'
    SURFACE_ALBEDO = 'SRF_ALB_ADJ'
    ALL_SKY_SURFACE_ALBEDO = 'ALLSKY_SRF_ALB'
    CLEAR_SKY_ALBEDO = 'CLRSKY_SRF_ALB'
    PRECIPITABLE_WATER = 'PW'
    SOLAR_ZENITH_ANGLE = 'SZA'
    CLEARNESS_INDEX   = 'ALLSKY_KT'                
    PRECIPITATION_CORRECTED  = 'PRECTOTCORR'    
    CLOUD_AMOUNT  = 'CLOUD_AMT'                  
    TEMPERATURE_RANGE  = 'T2M_RANGE'
    SURFACE_ROUGHNESS  = 'Z0M'           
    NORTHERN_WIND  = 'V2M'
    ARIMASS  = 'AIRMASS'                  
    ZERO_PLANE_DISPLACEMENT = 'DISPH'                  
    EVAPOTRANSPIRATION_ENERGY   = 'EVPTRNS'                   
    PLANETARY_BOUNDARY = 'PBLTOP'                   
    SURFACE_AIR_DENSITY = 'RHOA'                   
    SURFACE_ALBEDO_ADJ = 'SRF_ALB_ADJ'                   
    EVAPORATION_LAND = 'EVLAND'                   
    SURFACE_SOIL_WETNESS  = 'GWETTOP'
    WIND_SPEED = 'WS2M'   
     


class TemporalResolution(Enum):

    DAILY = 'daily'
    MONTHLY = 'monthly'
    HOURLY = 'hourly'



