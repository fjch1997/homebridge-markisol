# homekit-markisol

Adds homekit support to Markisol protocol 433.92MHz motorized window shades. Arduino code adapted from 

# Requirement

1. A 433.92MHz transmitter
2. An Arduino board directly connected to the computer running homebridge via USB.

# Usage

1. Install your 433.92MHz transceiver to data pin 7 (configurable in `TRANSMIT_PIN` in `<repo root>\Arduino\Arduino.ino`).
2. While in the repo root directory,

  ````
  npm install Homebridge -g
  ````
3. Modify your `config.json` in `%USERPROFILE%\.homebridge` following the example in the `config.json` in this repo.
4. Run HomeKit.

