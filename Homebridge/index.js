// import { SerialPort } from "serialport";
// import { Readline } from "serialport/lib/parsers";
// import { prototype } from "@serialport/parser-cctalk";
const SerialPort = require("serialport");
const Readline = require("serialport/lib/parsers");

var Accessory, Characteristic, UUIDGen;
var serialPort;

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
var portsListed = false;
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
        if (!this.config.downTravelDurationSeconds) {
            this.log.error("downTravelDurationSeconds is not defined for " + this.config.name + ". " + errorMessage);
            return;
        }
        if (!this.config.upTravelDurationSeconds) {
            this.log.error("upTravelDurationSeconds is not defined for " + this.config.name + ". " + errorMessage);
            return;
        }
        if (!portsListed) {
            this.listPorts();
            portsListed = true;
        }
        this.lastPosition = 100;
        this.lastPositionTime = 0;
        this.targetPosition = 100;
        this.lastActionTime = 0;
        this.lastCommand = this.getStopCommand();
        this.initializeSerial();
        setInterval(() => this.loop(), 1000);
    }
    listPorts() {
        SerialPort.list((err, ports) => {
            if (err) {
                this.log.warn("Unable to list serial port. " + err);
            }
            ports.forEach((port) => {
                this.log.info("Found serial port: " + port.comName + " " + port.manufacturer);
            });
        });
    }
    getServices() {
        let windowCoveringService = new Service.WindowCovering();
        windowCoveringService
            .getCharacteristic(Characteristic.CurrentPosition)
            .on('get', (callback) => {
                callback(null, this.lastPosition.toString());
            })
            .on('set', (value, callback) => {
                callback();
            });
        windowCoveringService
            .getCharacteristic(Characteristic.TargetPosition)
            // The corresponding value is an integer percentage. A value of 0 indicates a door or window should be fully closed, or that awnings
            // or shades should permit the least possible light. A value of 100 indicates the opposite.
            .on('get', (callback) => {
                callback(null, this.targetPosition.toString());
            })
            .on('set', (value, callback) => {
                this.targetPosition = value;
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
        if (serialPort) {
            this.log.info("Serial port already initialized.");
            return;
        }
        try {
            serialPort = new SerialPort(this.config.serialPortName, { autoOpen: false, baudRate: 9600 });
            this.parser = serialPort.pipe(new Readline.Readline({ delimiter: '\n' }));
            serialPort.on("open", () => {
                this.log.info("Serial port sucessfully opened. Sending handshake to Arduino.");
                setTimeout(() =>
                    serialPort.write("Hello\n", (err) => {
                        if (err) {
                            this.log.error('Failed to write serial: ', err.message);
                        }
                        this.log.debug("Hello sent.");
                    }), 2000);
            });
            this.parser.on('data', data => {
                if (data.trimEnd() === "Hello") {
                    this.log.debug("Connection to Arduino established.");
                }
                else if (data.substring(0, 7) !== "Sending") {
                    this.log.error("Invalid data received from Arduino: " + data);
                }
            });
            this.parser.on("error", err => {
                this.log.error("Parser error. " + err.message);
            });
            serialPort.open((err) => {
                if (err) {
                    this.log.error("Failed to open port. " + err);
                }
            });
        }
        catch (ex) {
            this.log.error(ex.message);
        }
    }
    loop() {
        if (this.targetPosition == this.lastPosition) {
            if (this.targetPosition != 0 && this.targetPosition != 100 && new Date() - this.lastActionTime < 60 * 1000) {
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
                if (this.targetPosition > this.lastPosition) {
                    this.lastCommand = this.getUpCommand()
                }
                else { // if (this.targetPosition < this.lastPosition)
                    this.lastCommand = this.getDownCommand();
                }
                this.sendCommand(this.lastCommand);
            }
            else {
                var currentPosition;
                if (this.lastCommand == this.getUpCommand()) {
                    if (this.targetPosition > this.lastPosition) {
                        direction = 1;
                        var howFarBlindTraveled = timeInterval / (this.config.upTravelDurationSeconds * 1000) * 100;
                        currentPosition = this.lastPosition + howFarBlindTraveled;
                    }
                    else { // if (this.targetPosition < this.lastPosition)
                        direction = -1;
                        var howFarBlindTraveled = timeInterval / (this.config.downTravelDurationSeconds * 1000) * 100;
                        currentPosition = this.lastPosition + howFarBlindTraveled;
                    }
                }
                else { // if (this.lastCommand == this.getDownCommand()) {
                    if (this.targetPosition > this.lastPosition) {
                        direction = 1;
                        var howFarBlindTraveled = timeInterval / (this.config.upTravelDurationSeconds * 1000) * 100;
                        currentPosition = this.lastPosition - howFarBlindTraveled;
                    }
                    else { // if (this.requestedPosition < this.lastPosition)
                        direction = -1;
                        var howFarBlindTraveled = timeInterval / (this.config.downTravelDurationSeconds * 1000) * 100;
                        currentPosition = this.lastPosition - howFarBlindTraveled;
                    }
                }
                if (currentPosition > 100) {
                    currentPosition = 100;
                }
                else if (currentPosition < 0) {
                    currentPosition = 0;
                }
                this.windowCoveringService.getCharacteristic(Characteristic.CurrentPosition).updateValue(currentPosition);
                if (direction * this.targetPosition <= direction * currentPosition) {
                    if (this.targetPosition == 0 || this.targetPosition == 100) {
                        // Complete. No need to send stop command.
                        this.lastPosition = this.targetPosition;
                        this.lastCommand = this.getStopCommand();
                        return;
                    }
                    else {
                        // Complete. Blind might be slightly higher/lower than requested.
                        this.targetPosition = currentPosition;
                        this.windowCoveringService.getCharacteristic(Characteristic.TargetPosition).updateValue(this.targetPosition);
                        this.log.info("Target position " + this.targetPosition + " is reached.");
                        this.lastCommand = this.getStopCommand()
                    }
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
        this.log.debug("Sending " + command);
        serialPort.write(command + "\n", (err) => {
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
