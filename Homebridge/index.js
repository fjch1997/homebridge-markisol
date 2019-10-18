// import { SerialPort } from "serialport";
// import { Readline } from "serialport/lib/parsers";
// import { prototype } from "@serialport/parser-cctalk";
const SerialPort = require("serialport");
const Readline = require("serialport/lib/parsers");

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

const remoteModel = "10000011";
const trailingBits = "000000000";
class MarkisolAccessory {
    constructor(log, config) {
        this.log = log;
        this.config = config;
        const errorMessage = "Check your homebridge config.json. This accessory will not work.";
        if (!this.config.name) {
            this.log.error("A name for this MarkisolBlind accessory is not defined. " + errorMessage);
            return;
        }
        if (!this.config.remoteId) {
            this.log.error("remoteId is not defined for " + this.config.name + ". " + errorMessage);
            return;
        }
        if (!this.config.channel) {
            this.log.error("channel is not defined for " + this.config.name + ". " + errorMessage);
            return;
        }
        if (!this.config.serialPortName) {
            this.log.error("serialPortName is not defined for " + this.config.name + ". " + errorMessage);
            return;
        }
        if (!this.config.travelDurationSeconds) {
            this.log.error("travelDurationSeconds is not defined for " + this.config.name + ". " + errorMessage);
            return;
        }
        this.lastPosition = 100;
        this.lastPositionTime = 0;
        this.requestedPosition = 100;
        this.lastActionTime = 0;
        this.lastCommand = this.getStopCommand();
        this.initializeSerial();
        setInterval(() => this.loop(), 1000);
    }
    getServices() {
        let windowCoveringService = new Service.WindowCovering();
        windowCoveringService
            .getCharacteristic(Characteristic.CurrentPosition)
            .on('get', (callback) => {
                callback(null, this.lastPosition.toString());
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
                callback(null, this.requestedPosition.toString());
            })
            .on('set', (value, callback) => {
                this.log.info("TargetPosition set called.");
                this.requestedPosition = value;
                this.lastActionTime = new Date();
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
    initializeSerial() {
        this.serialPort = new SerialPort(this.config.serialPortName, { baudRate: 9600 });
        this.parser = this.serialPort.pipe(new Readline.Readline({ delimiter: '\n' }));
        this.serialPort.on("open", () => {
            this.log.info("Serial port sucessfully opened. Sending handshake to Arduino.");
            this.serialPort.write("Hello", (err) => {
                if (err) {
                    this.log.error('Failed to write serial: ', err.message);
                }
                this.log.debug("Hello sent.");
            })
        });
        this.parser.on('data', data => {
            if (data === "Hello") {
                this.log.info("Connection to Arduino established.");
            }
            else {
                this.log.error("Invalid data received from Arduino: " + data);
            }
        });
    }
    loop() {
        if (this.requestedPosition == this.lastPosition) {
            if (new Date() - this.lastActionTime < 60 * 1000) {
                // Keep sending stop command within 60 seconds.
                this.sendCommand(this.getStopCommand());
            }
            return;
        }
        else {
            var direction = 0;
            var currentTime = new Date();
            var timeInterval = currentTime - this.lastPositionTime; // Milisecond interval.
            if (this.lastCommand == this.getStopCommand()) {
                this.lastPositionTime = new Date();
                if (this.requestedPosition > this.lastPosition) {
                    this.lastCommand = this.getUpCommand()
                }
                else { // if (this.requestedPosition < this.lastPosition)
                    this.lastCommand = this.getDownCommand();
                }
                this.sendCommand(this.lastCommand);
            }
            else {
                var currentPosition;
                var howFarBlindTraveled = timeInterval / (this.config.travelDurationSeconds * 1000) * 100;
                if (this.lastCommand == this.getUpCommand()) {
                    if (this.requestedPosition > this.lastPosition) {
                        direction = 1;
                        currentPosition = this.lastPosition + howFarBlindTraveled;
                    }
                    else { // if (this.requestedPosition < this.lastPosition)
                        direction = -1;
                        currentPosition = this.lastPosition + howFarBlindTraveled;
                    }
                }
                else { // if (this.lastCommand == this.getDownCommand()) {
                    if (this.requestedPosition > this.lastPosition) {
                        direction = 1;
                        currentPosition = this.lastPosition - howFarBlindTraveled;
                    }
                    else { // if (this.requestedPosition < this.lastPosition)
                        direction = -1;
                        currentPosition = this.lastPosition - howFarBlindTraveled;
                    }
                }
                if (direction * this.requestedPosition <= direction * currentPosition) {
                    // Complete. Blind might be slightly higher than requested.
                    this.requestedPosition = currentPosition;
                    this.lastCommand = this.getStopCommand()
                }
                else if (direction == 1) {
                    this.lastCommand = this.getUpCommand();
                }
                else { //if (direction == -1)
                    this.lastCommand = this.getDownCommand();
                }
                this.sendCommand(this.lastCommand);
                this.lastPosition = currentPosition;
                this.lastPositionTime = currentTime;
            }
        }
    }
    sendCommand(command) {
        this.serialPort.write(command, (err) => {
            if (err) {
                this.log.error("Failed to write serial: ", err.message);
            }
        });
    }
    getUpCommand() {
        return this.config.remoteId + this.config.channel + "0011" + remoteModel + trailingBits;
    }
    getDownCommand() {
        return this.config.remoteId + this.config.channel + "1000" + remoteModel + trailingBits;
    }
    getStopCommand() {
        return this.config.remoteId + this.config.channel + "1010" + remoteModel + trailingBits;
    }
}
