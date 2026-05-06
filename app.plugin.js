const { withInfoPlist } = require('@expo/config-plugins')

const DEFAULT_LOCATION_DESCRIPTION =
  '$(PRODUCT_NAME) uses your heading to power the compass.'

const withNitroCompass = (config, props = {}) => {
  return withInfoPlist(config, (cfg) => {
    cfg.modResults.NSLocationWhenInUseUsageDescription =
      props.locationWhenInUsePermission ||
      cfg.modResults.NSLocationWhenInUseUsageDescription ||
      DEFAULT_LOCATION_DESCRIPTION
    return cfg
  })
}

module.exports = withNitroCompass
