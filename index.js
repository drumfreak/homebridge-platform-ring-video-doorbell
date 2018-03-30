/* jshint asi: true, node: true, laxbreak: true, laxcomma: true, undef: true, unused: true */

// there is no known webhook/websocket to use for events, this results in very frequent polling under the push-sensor model...

var homespun    = require('homespun-discovery')
  , pushsensor  = homespun.utilities.pushsensor
  , PushSensor  = pushsensor.Sensor
  , RingAPI     = require('doorbot')
  , sensorTypes = homespun.utilities.sensortypes
  , underscore  = require('underscore')
  , util        = require('util')
  , ringApi     = require('ring-api')


var Accessory
  , Service
  , Characteristic
  , CommunityTypes
  , UUIDGen

module.exports = function (homebridge) {
  Accessory      = homebridge.platformAccessory
  Service        = homebridge.hap.Service
  Characteristic = homebridge.hap.Characteristic
  CommunityTypes = require('hap-nodejs-community-types')(homebridge)
  UUIDGen        = homebridge.hap.uuid

  pushsensor.init(homebridge)
  homebridge.registerPlatform('homebridge-platform-ring-video-doorbell', 'ring-video-doorbell', Ring, true)
}


var Ring = function (log, config, api) {
  if (!(this instanceof Ring)) return new Ring(log, config, api)

  if (!config) return

  this.log = log
  this.config = config
  this.api = api

  this.options = underscore.defaults(this.config.options || {}, { retries: 5, ttl: 5, verboseP: false })

  this.discoveries = {}
  this.doorbots = {}
  this.stickup_cams = {}

  if (api) this.api.on('didFinishLaunching', this._didFinishLaunching.bind(this))
  else this._didFinishLaunching()
}

Ring.prototype._didFinishLaunching = function () {
  var self = this

  var refresh = function () {

    // var ring2 = ringApi( { email: self.config.username,
    //                       password:  self.config.password,
    //                       userAgent: self.options.userAgent,
    //                       poll: false
    // });

    // self.doorbot2 = ring2;


    var ring = RingAPI({ email     : self.config.username
                       , password  : self.config.password
                       , retries   : self.options.retries
                       , userAgent : self.options.userAgent
                       })



    // const logActivity = activity => console.log( 'there is a activity', activity );

    // self.doorbot2.events.on('activity', logActivity);

    self.doorbot = ring


    self._refresh1(function (err) {

      if(self.options.verboseP) {
          self.log('_refresh1 running');
        }
      if (err) {
        self.log.error('refresh1', underscore.extend({ username: self.config.username }, err))
        return setTimeout(refresh, 30 * 1000)
      }

      self._refresh2(function (err) {
        if(self.options.verboseP) {
          self.log('_refresh2 running');
        }
        if (err) {
          self.log.error('refresh2', underscore.extend({ username: self.config.username }, err))
          return setTimeout(refresh, 30 * 1000)
        }
        return setTimeout(refresh, self.options.ttl * 1000)
      })
    });
  }

  refresh()
  if(self.options.verboseP) {
      self.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! didFinishLaunching !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!')
  }
}

Ring.prototype._addAccessory = function (device) {
  var self = this

  var accessory = new Accessory(device.name, device.uuid)

  accessory.on('identify', function (paired, callback) {
    if(self.options.verboseP) {
      self.log(accessory.displayName, ': identify request')
    }
    callback()
  })

  if (device.attachAccessory.bind(device)(accessory)) self.api.updatePlatformAccessories([ accessory ])

  if (!self.discoveries[accessory.UUID]) {
    self.api.registerPlatformAccessories('homebridge-platform-ring-video-doorbell', 'ring-video-doorbell', [ accessory ])
    if(self.options.verboseP) {
      self.log('addAccessory', underscore.pick(device, [ 'uuid', 'name', 'manufacturer', 'model', 'serialNumber' ]))
    }
  }
}

Ring.prototype.configurationRequestHandler = function (context, request, callback) {/* jshint unused: false */
  //
    if(this.options.verboseP) {
        this.log('configuration request', { context: context, request: request })
    }
}

Ring.prototype.configureAccessory = function (accessory) {
  var self = this

  accessory.on('identify', function (paired, callback) {
    if(self.options.verboseP) {
      self.log(accessory.displayName, ': identify request')
    }
    callback()
  })

  self.discoveries[accessory.UUID] = accessory
  if(self.options.verboseP) {
    self.log('configureAccessory', underscore.pick(accessory, [ 'UUID', 'displayName' ]))
  }
}

/*
{ "doorbots"              :
  { "id"                  : ...
  , "description"         : "Front Gate"
  , "device_id"           : "..."
  , "time_zone"           : "America\/Chicago"
  , "subscribed"          : true
  , "subscribed_motions"  : true
  , "battery_life"        : 20
  , "external_connection" : false
  , "firmware_version"    : "1.8.73"
  , "kind"                : "doorbell"
  , "latitude"            : 39.8333333
  , "longitude"           : -98.585522
  , "address"             : ".... .... .., Lebanon, KS 66952 USA"
  , "settings"            : { ... }
  , "features"            :
    { "motions_enabled"   : true
    , "show_recordings"   : true
    , "show_vod_settings" : true
    }
  , "owned"               : true
  , "alerts"              :
    { "connection"        : "offline"
    , "battery"           : "low"
    }
  , "owner"               :
    { "id"                : ...
    , "first_name"        : null
    , "last_name"         : null
    , "email"             : "user@example.com"
    }
  }
, "authorized_doorbots"   : [ ... ]
, "chimes"                : [ ... ]
, "stickup_cams"          : [ ... ]
}
 */

Ring.prototype._refresh1 = function (callback) {
  var self = this

  // self.log('~~~~~~~~~ ATTEMPTING NEW DOORBOT ~~~~~~~~~~~');

  // const getDevices = async() => {
  //   const rdevices = await self.doorbot2.devices()
  //   console.log(rdevices);
  // }

  // getDevices();

  // self.doorbot2.devices().then(function (err, result) {
  //   if(err) {
  //     self.log.error(err);
  //     return callback(err);
  //   }

  //   if(result) {
  //     self.log(result);
  //   }

  // });

  self.doorbot.devices(function (err, result) {
    var serialNumbers = []

    if (err) return callback(err)

    var handle_device = function(proto, devices, service) {
      var capabilities, properties
        , deviceId = service.id
        , device = devices[deviceId]

      if (!device) {
        if(self.options.verboseP) {
          self.log('type: ' + ((devices === self.doorbots) ? 'ringing' : 'floodlight') + ' ... ' + JSON.stringify(service, null, 2))
        }
        capabilities = underscore.pick(sensorTypes,
                                       [ 'battery_level', 'battery_low', 'motion_detected', 'reachability' ])
        underscore.extend(capabilities, underscore.pick(sensorTypes,
                                                        [ (devices === self.doorbots) ? 'ringing' : 'floodlight' ]))
        properties = { name             : service.description
                     , manufacturer     : 'Bot Home Automation, Inc.'
                     , model            : service.kind
                     , serialNumber     : service.id.toString()
                     , firmwareRevision : service.firmware_version
                     , hardwareRevision : ''
                     }

        device = new proto(self, service.id.toString(), { capabilities: capabilities, properties: properties })
        devices[deviceId] = device
      }

      device.readings = { battery_level : service.battery_life
                        , battery_low   : (service.alerts) && (service.alerts.battery == 'low')
                                              ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
                                              : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
                        , reachability  : (service.alerts) && (service.alerts.connection !== 'offline')
                        , floodlight    : !service.led_status ? undefined : service.led_status !== 'off'
                        }
      device._update.bind(device)(device.readings)

      serialNumbers.push(service.id.toString())
    }
    var check_devices = function (devices) {
      underscore.keys(devices).forEach(function (deviceId) {
        var device = devices[deviceId]
        var accessory = device.accessory

        if (serialNumbers.indexOf(device.serialNumber) !== -1) return

        if (accessory) {
          self.api.registerPlatformAccessories('homebridge-platform-ring-video-doorbell', 'ring-video-doorbell', [ accessory ])
          if(self.options.verboseP) {
            self.log('removeAccessory', underscore.pick(device, [ 'uuid', 'name', 'manufacturer', 'model', 'serialNumber' ]))
          }
        }

        delete devices[deviceId]
      })
    }

    if (!result) result = {}

    if (!result.doorbots) result.doorbots = []
    result.doorbots.forEach(function (service) { handle_device(Doorbot, self.doorbots, service) })
    check_devices(self.doorbots)

    if (!result.stickup_cams) result.stickup_cams = []
    result.stickup_cams.forEach(function (service) {
      if(self.options.verboseP) {
        self.log('Stick Up Cam', service);
      }
      handle_device(StickupCam, self.stickup_cams, service)

    })
    check_devices(self.stickup_cams)

    callback()
  })
}

/*
[
  {
    "id"                     : ...,
    "id_str"                 : "...",
    "state"                  : "ringing",
    "protocol"               : "sip",
    "doorbot_id"             : ...,
    "doorbot_description"    : "Front Gate",
    "device_kind"            : "doorbell",
    "motion"                 : false,
    "snapshot_url"           : "",
    "kind"                   : "ding",
    "sip_server_ip"          : "a.b.c.d"
    "sip_server_port"        : "15063",
    "sip_server_tls"         : "false",
    "sip_session_id"         : "...",
    "sip_from"               : "sip:...@ring.com",
    "sip_to"                 : "sip:...@a.b.c.d:15063;transport=tcp",
    "audio_jitter_buffer_ms" : 0,
    "video_jitter_buffer_ms" : 0,
    "sip_endpoints"          : null,
    "expires_in"             : 171,
    "now"                    : 1483114179.70994,
    "optimization_level"     : 3,
    "sip_token"              : "..."
    "sip_ding_id"            : "..."
  }
]
 */

Ring.prototype._refresh2 = function (callback) {
  var self = this

  self.doorbot.dings(function (err, result) {
    if (err) return callback(err)

    if (!util.isArray(result)) return callback(new Error('not an Array: ' + typeof result))

    underscore.keys(self.doorbots).forEach(function (deviceId) {
      underscore.extend(self.doorbots[deviceId].readings, { motion_detected: false, ringing: false })
    })

    result.forEach(function (event) {
      var device

      if (event.state !== 'ringing') return

      if(self.options.verboseP) {
        if(event.kind === 'ding') {
          self.log('🎵 RING RING!!!');

        } else if(event.kind === 'motion') {
          self.log('🎵 Motion Detected!');

        }
      }

      device = self.doorbots[event.doorbot_id] || self.stickup_cams[event.doorbot_id]
      if (!device) return self.log.error('dings/active: no device', event)

      underscore.extend(device.readings, { motion_detected : (event.kind === 'motion') || (event.motion)
                                         , ringing         : event.kind === 'ding' })
    })
    underscore.keys(self.doorbots).forEach(function (deviceId) {
      var device = self.doorbots[deviceId]

      device._update.bind(device)(device.readings)
    })
    underscore.keys(self.stickup_cams).forEach(function (deviceId) {
      var device = self.stickup_cams[deviceId]

      device._update.bind(device)(device.readings)
    })

    callback()
  })
}


var Doorbot = function (platform, deviceId, service) {
  if (!(this instanceof Doorbot)) return new Doorbot(platform, deviceId, service)

  PushSensor.call(this, platform, deviceId, service)
}
util.inherits(Doorbot, PushSensor)

var StickupCam = function (platform, deviceId, service) {
  var self = this

  if (!(this instanceof StickupCam)) return new StickupCam(platform, deviceId, service)

  var floodlight

  PushSensor.call(this, platform, deviceId, service)

  floodlight = self.getAccessoryService(Service.Lightbulb)
  if (!floodlight) return self.log.warn('StickupCam', { err: 'could not find Service.Lightbulb' })

  if(platform.options.verboseP) {
    platform.log('!!! 💡📹 floodlight / stickup cam found - setting floodlight callback for on/off')
  }

  floodlight.getCharacteristic(Characteristic.On).on('set', function (value, callback) {
    if(floodlight.getCharacteristic(Characteristic.On).value !== value) {
      if(platform.options.verboseP) {
        platform.log('Attempting to set floodlight bulb value to ' + JSON.stringify(value))
        platform.log('OLD Value: ' + floodlight.getCharacteristic(Characteristic.On).value + ' New Value: ' + value);
      }
      platform.doorbot[value ? 'lightOn' : 'lightOff']({ id: deviceId }, function (err, response, result) {/* jshint unused: false */
        if (err) {
          if(platform.options.verboseP) {
            platform.log.error('💡floodlight setValue', underscore.extend({ deviceId: deviceId }, err))
          }
        } else {
          if(platform.options.verboseP) {
            platform.log('💡💡 floodlight setting value to ' + JSON.stringify(value))
          }
        }

        self._update.bind(self)({ floodlight: value })
        callback()
      })
     }
  })
  //console.log('!!! callback for on/off is now set')
}
util.inherits(StickupCam, PushSensor)
