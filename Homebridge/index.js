var Accessory, Characteristic, UUIDGen;

module.exports = function (homebridge) {
    console.log("homebridge API version: " + homebridge.version);

    // Accessory must be created from PlatformAccessory Constructor
    Accessory = homebridge.platformAccessory;

    // Service and Characteristic are from hap-nodejs
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    UUIDGen = homebridge.hap.uuid;

    homebridge.registerAccessory("homebridge-markisol", "MarkisolBlind", MarkisolAccessory);
}

class MarkisolAccessory {
    constructor(log, config) {
        this.log = log;
        this.config = config;
        const errorMessage = "Check your homebridge config.json. This accessory will not work.";
        if (!this.config.name) {
            this.log.error("A name for this MarkisolBlind accessory is not defined. " + errorMessage);
        }
        if (!this.config.remoteId) {
            this.log.error("remoteId not defined for " + this.config.name + ". " + errorMessage);
        }
        if (!this.config.channel) {
            this.log.error("channel not defined for " + this.config.name + ". " + errorMessage);
        }
    }
    getServices() {
        let windowCoveringService = new Service.WindowCovering();
        windowCoveringService
            .getCharacteristic(Characteristic.CurrentPosition)
            .on('get', (callback) => {
                callback(null, "100");
            })
            .on('set', (value, callback) => {
                this.log.info("CurrentPosition set called.");
                callback();
            });
        windowCoveringService
            .getCharacteristic(Characteristic.TargetPosition)
            // The corresponding value is an integer percentage. A value of 0 indicates a door or window should be fully closed, or that awnings
            // or shades should permit the least possible light. A value of 100 indicates the opposite.
            .on('get', (callback) => {
                callback(null, "100");
            })
            .on('set', (value, callback) => {
                this.log.info("TargetPosition set called.");
                callback();
            });
        windowCoveringService
            .getCharacteristic(Characteristic.HoldPosition)
            .on('set', (value, callback) => {
                // The corresponding value is a write-only Boolean. Write a value of true to indicate that the current position should be maintained. 
                // The accessory ignores a written value of false. Write a value to the HMCharacteristicTypeTargetPosition characteristic to 
                // release the hold.
                this.log.info("Hold position was set to " + value);
                callback();
            });
        this.windowCoveringService = windowCoveringService;
        return [windowCoveringService];
    }
}
