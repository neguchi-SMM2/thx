function isNum(...values) {
  if (!values.length) return false;
  for (var value of values) {
    if (value === 0) return true;
    if (["", null, Infinity, true, false].includes(value) || isNaN(value)) return false;
  }

  return true;
}

var tableLength = 100;

var _atob = function(string) {
  var b64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  var b64re = /^(?:[A-Za-z\d+\/]{4})*?(?:[A-Za-z\d+\/]{2}(?:==)?|[A-Za-z\d+\/]{3}=?)?$/;

  string = String(string.replace(/^.*?base64,/, "")).replace(/[\t\n\f\r ]+/g, "");

  if (!b64re.test(string)) throw new TypeError("Failed to execute _atob() : The string to be decoded is not correctly encoded.");

  string += "==".slice(2 - (string.length & 3));
  var bitmap, result = "";
  var r1, r2, i = 0;

  for (; i < string.length; ) {
    bitmap = (b64.indexOf(string.charAt(i ++)) << 18) |
      (b64.indexOf(string.charAt(i ++)) << 12) |
      ((r1 = b64.indexOf(string.charAt(i ++))) << 6) |
      (r2 = b64.indexOf(string.charAt(i ++)));

    result += r1 == 64 ? String.fromCharCode((bitmap >> 16) & 255)
    : r2 == 64 ? String.fromCharCode((bitmap >> 16) & 255, (bitmap >> 8) & 255)
    : String.fromCharCode((bitmap >> 16) & 255, (bitmap >> 8) & 255, bitmap & 255);
  }

  return result;
}

var MidiParser = {
  debug: false,

  parse: function(input, _callback) {
    if (input instanceof Uint8Array) return MidiParser.Uint8(input);
    else if (typeof input == "string") return MidiParser.Base64(input);
    else if (input instanceof HTMLElement && input.type == "file") return MidiParser.addListener(input, _callback);
    else throw new Error("MidiParser.parse() : Invalid input provided");
  },

  addListener: function(_fileElement, _callback) {
    if (!File || !FileReader) throw new Error("The File|FileReader APIs are not supported in this browser. Use instead MidiParser.Base64() or MidiParser.Uint8()");

    if (_fileElement == undefined || !(_fileElement instanceof HTMLElement)
      || _fileElement.tagName != "INPUT" || _fileElement.type.toLowerCase() != "file") return false;

    _callback = _callback || function() {};

    buttonLoadSmf.addEventListener("click", function() {
      if (!inputSmf.files.length) return false;

      var reader = new FileReader();
      reader.readAsArrayBuffer(inputSmf.files[0]);

      reader.onload = function(e) {
        _callback(MidiParser.Uint8(new Uint8Array(e.target.result)));
      };
    });
  },

  Base64: function(b64String) {
    b64String = String(b64String);

    var raw = _atob(b64String);
    var rawLength = raw.length;
    var t_array = new Uint8Array(new ArrayBuffer(rawLength));

    for (var i = 0; i < rawLength; i ++) t_array[i] = raw.charCodeAt(i);
    return MidiParser.Uint8(t_array);
  },

  Uint8: function(FileAsUint8Array) {
    var file = {
      data: null,
      pointer: 0,
      movePointer: function(_bytes) {
        this.pointer += _bytes;
        return this.pointer;
      },

      readInt: function(_bytes) {
        _bytes = Math.min(_bytes, this.data.byteLength - this.pointer);

        if (_bytes < 1) return -1;
        var value = 0;

        if (_bytes > 1) {
          for (var i = 1; i <= _bytes - 1; i ++) {
            value += this.data.getUint8(this.pointer) * Math.pow(256, _bytes - i);
            this.pointer ++;
          }
        }

        value += this.data.getUint8(this.pointer);
        this.pointer ++;
        return value;
      },

      readStr: function(_bytes) {
        var text = "";

        for (var char = 1; char <= _bytes; char ++) text += String.fromCharCode(this.readInt(1));
        return text;
      },

      readIntVLV: function() {
        var value = 0;

        if (this.pointer >= this.data.byteLength) {
          return -1;

        } else if (this.data.getUint8(this.pointer) < 128) {
          value = this.readInt(1);

        } else {
          var FirstBytes = [];

          while (this.data.getUint8(this.pointer) >= 128) {
            FirstBytes.push(this.readInt(1) - 128);
          }

          var lastByte = this.readInt(1);

          for (var dt = 1; dt <= FirstBytes.length; dt ++) {
            value += FirstBytes[FirstBytes.length - dt] * Math.pow(128, dt);
          }

          value += lastByte;
        }

        return value;
      },
    };

    file.data = new DataView(
      FileAsUint8Array.buffer,
      FileAsUint8Array.byteOffset,
      FileAsUint8Array.byteLength
    );

    if (file.readInt(4) != 0x4d546864) {
      return false;
    }

    file.readInt(4);

    var MIDI = {};
    MIDI.formatType = file.readInt(2);
    MIDI.trackNum = file.readInt(2);
    MIDI.tracks = [];

    var timeUnitByte1 = file.readInt(1);
    var timeUnitByte2 = file.readInt(1);

    if (timeUnitByte1 >= 128) {
      MIDI.timeUnit = [];
      MIDI.timeUnit[0] = timeUnitByte1 - 128;
      MIDI.timeUnit[1] = timeUnitByte2;

    } else {
      MIDI.timeUnit = timeUnitByte1 * 256 + timeUnitByte2;
    }

    for (var t = 1; t <= MIDI.trackNum; t ++) {
      MIDI.tracks[t - 1] = { events: [] };
      var headerValidation = file.readInt(4);

      if (headerValidation == -1) break;
      if (headerValidation != 0x4d54726b) return false;

      file.readInt(4);
      var e = 0;
      var endOfTrack = false;

      var statusByte;
      var laststatusByte;

      while (!endOfTrack) {
        e ++;
        MIDI.tracks[t - 1].events[e - 1] = {};
        MIDI.tracks[t - 1].events[e - 1].deltaTime = file.readIntVLV();
        statusByte = file.readInt(1);

        if (statusByte == -1) break;
        else if (statusByte >= 128) laststatusByte = statusByte;
        else {
          statusByte = laststatusByte;
          file.movePointer(-1);
        }

        if (statusByte == 0xff) {
          MIDI.tracks[t - 1].events[e - 1].type = 0xff;
          MIDI.tracks[t - 1].events[e - 1].metaType = file.readInt(1);

          var metaEventLength = file.readIntVLV();

          switch (MIDI.tracks[t - 1].events[e - 1].metaType) {
            case 0x2f:
            case -1:
              endOfTrack = true;
              break;

            case 0x01:
            case 0x02:
            case 0x03:
            case 0x04:
            case 0x05:
            case 0x07:
            case 0x06:
              MIDI.tracks[t - 1].events[e - 1].data = file.readStr(metaEventLength);
              break;

            case 0x21:
            case 0x59:
            case 0x51:
              MIDI.tracks[t - 1].events[e - 1].data = file.readInt(metaEventLength);
              break;

            case 0x54:
              MIDI.tracks[t - 1].events[e - 1].data = [];
              MIDI.tracks[t - 1].events[e - 1].data[0] = file.readInt(1);
              MIDI.tracks[t - 1].events[e - 1].data[1] = file.readInt(1);
              MIDI.tracks[t - 1].events[e - 1].data[2] = file.readInt(1);
              MIDI.tracks[t - 1].events[e - 1].data[3] = file.readInt(1);
              MIDI.tracks[t - 1].events[e - 1].data[4] = file.readInt(1);
              break;

            case 0x58:
              MIDI.tracks[t - 1].events[e - 1].data = [];
              MIDI.tracks[t - 1].events[e - 1].data[0] = file.readInt(1);
              MIDI.tracks[t - 1].events[e - 1].data[1] = file.readInt(1);
              MIDI.tracks[t - 1].events[e - 1].data[2] = file.readInt(1);
              MIDI.tracks[t - 1].events[e - 1].data[3] = file.readInt(1);
              break;

            default:
              if (this.customInterpreter != null) {
                MIDI.tracks[t - 1].events[e - 1].data = this.customInterpreter(
                  MIDI.tracks[t - 1].events[e - 1].metaType, file, metaEventLength);
              }

              if (this.customInterpreter == null || !MIDI.tracks[t - 1].events[e - 1].data) {
                file.readInt(metaEventLength);
                MIDI.tracks[t - 1].events[e - 1].data = file.readInt(metaEventLength);
              }
          }

        } else {
          statusByte = statusByte.toString(16).split("");

          if (!statusByte[1]) statusByte.unshift("0");
          MIDI.tracks[t - 1].events[e - 1].type = parseInt(statusByte[0], 16);
          MIDI.tracks[t - 1].events[e - 1].channel = parseInt(statusByte[1], 16);

          switch (MIDI.tracks[t - 1].events[e - 1].type) {
            case 0xf:
              if (this.customInterpreter != null) {
                MIDI.tracks[t - 1].events[e - 1].data = this.customInterpreter(
                  MIDI.tracks[t - 1].events[e - 1].type, file, false);
              }

              if (this.customInterpreter == null || !MIDI.tracks[t - 1].events[e - 1].data) {
                var eventLength = file.readIntVLV();
                MIDI.tracks[t - 1].events[e - 1].data = file.readInt(eventLength);
              }
              break;

            case 0xa:
            case 0xb:
            case 0xe:
            case 0x8:
            case 0x9:
              MIDI.tracks[t - 1].events[e - 1].data = [];
              MIDI.tracks[t - 1].events[e - 1].data[0] = file.readInt(1);
              MIDI.tracks[t - 1].events[e - 1].data[1] = file.readInt(1);
              break;

            case 0xc:
            case 0xd:
              MIDI.tracks[t - 1].events[e - 1].data = file.readInt(1);
              break;

            case -1:
              endOfTrack = true;
              break;

            default:
              if (this.customInterpreter != null) {
                MIDI.tracks[t - 1].events[e - 1].data = this.customInterpreter(
                  MIDI.tracks[t - 1].events[e - 1].metaType, file, false);
              }

              if (this.customInterpreter == null || !MIDI.tracks[t - 1].events[e - 1].data) return false;
          }
        }
      }
    }

    return MIDI;
  },

  customInterpreter: null,
};

if (typeof module != "undefined") module.exports = MidiParser;
else {
  var _global = (typeof window == "object" && window.self == window && window)
  || (typeof self == "object" && self.self == self && self)
  || (typeof global == "object" && global.global == global && global);

  _global.MidiParser = MidiParser;
}

MidiParser.parse(inputSmf, (midiData) => {
  if (!midiData) {
    alert("SMFが無効かもです。");
    return;
  }

  if (midiData.formatType != 1) {
    alert("フォーマット1しか対応してません。申し訳ない...");
    return;
  }

  var timeUnit = midiData.timeUnit;

  var track = midiData.tracks[selectTrack.selectedIndex];
  var notes = [];

  if (!track) {
    alert("トラックがありません。");
    return;
  }

  for (var event of track.events) {
    var type = event.type;
    var data = event.data;

    if (type == 255 && event.metaType == 1) {
      if (data == "MMstart") {
        notes = [];
        continue;
      }

      if (data == "MMend") break;
    }

    if (notes.length) notes[notes.length - 1].time += event.deltaTime;
    if (type == 9 && data[1] > 0) {
      notes.push({time: 0, key: data[0]});
      continue;
    }
  }

  if (!notes.length) {
    alert("そのトラックにはなんもありません。");
    return;
  }

  notes[notes.length - 1].time = timeUnit;
  var baseKey = notes[0].key;

  selectTableInput.selectedIndex = 0;
  inputTimeUnit.value = timeUnit;

  stopPlay();

  for (var i = 2; i <= 4; i ++) {
    for (var j = 1; j <= tableLength; j ++) {
      tableInput.rows[i].cells[j].textContent = "";
    }
  }

  notes.forEach((event, i) => {
    if (i >= tableLength) return;

    tableInput.rows[2].cells[i + 1].textContent = event.time;
    tableInput.rows[4].cells[i + 1].textContent = event.key - baseKey;
  });

  setTimeUnit(timeUnit);
});

var wingInd = 0;

function changeWing(selectedIndex) {
  wingInd = selectedIndex;

  while(selectLanding.length > 3) {
    selectLanding.removeChild(selectLanding.lastChild);
  }

  [["2a", "2b", "3", "4a", "4b"], ["2", "3", "4"]][wingInd].forEach(pattern => {
    var option = document.createElement("option");

    option.textContent = pattern;
    selectLanding.appendChild(option);
  });

  selectLanding.selectedIndex = 0;
  clearTable(tableWiring, 3, 2);
}

var keys = ["ド", "ド#", "レ", "レ#", "ミ", "ファ", "ファ#", "ソ", "ソ#", "ラ", "ラ#", "シ"];

for (var i = 27; i >= 0; i --) {
  var option = document.createElement("option");

  var octave = 1;
  if (i >= 12) octave = i >= 24 ? 3 : 2;

  option.text = `${octave}-${keys[i % 12]}`;
  selectScale.appendChild(option);
}

selectScale.selectedIndex = 15;

document.querySelectorAll(".tableWirings").forEach(table => {
  table.style.width = `${tableLength * 4}rem`;
});

for (var i = 1; i <= tableLength; i ++) {
  var th0 = document.createElement("th");
  th0.textContent = i;
  tableInput.rows[0].appendChild(th0);

  var th1 = document.createElement("th");
  th1.textContent = i;
  tableWiring.rows[0].appendChild(th1);

  var th2 = document.createElement("th");
  th2.textContent = i;
  tableSort.rows[0].appendChild(th2);

  for (var j = 1; j <= 4; j ++) {
    var cell = tableInput.rows[j].insertCell();
    cell.contentEditable = true;

    if (j == 2) cell.addEventListener("input", calcNote);
  }

  tableWiring.rows[1].insertCell().contentEditable = true;
  tableWiring.rows[2].insertCell().contentEditable = true;

  if (i >= 2) {
    tableWiring.rows[3].insertCell().contentEditable = true;
    tableWiring.rows[4].insertCell().contentEditable = true;
    tableWiring.rows[5].insertCell().contentEditable = true;
  }

  tableSort.rows[1].insertCell().contentEditable = true;
  tableSort.rows[2].insertCell();
  tableSort.rows[3].insertCell();
  tableSort.rows[4].insertCell();

  var buttonCell = tableSort.rows[5].insertCell();

  var button = document.createElement("button");
  button.style = "width: 3.4rem; height: 1.5rem;";
  button.addEventListener("click", tableButton);

  buttonCell.style.textAlign = "center";
  buttonCell.style.varticalAlign = "middle";
  buttonCell.appendChild(button);
}

document.querySelectorAll(".tableWirings td").forEach(table => {
  table.addEventListener("blur", event => event.target.scrollLeft = 0);
});

var arrows = ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"];

tableInput.addEventListener("keydown", event => {
  if (event.ctrlKey) {
    var row = event.target.parentNode.rowIndex;
    var cell = event.target.cellIndex;

    var shifts = [[0, 1], [0, -1], [-1, 0], [1, 0]][arrows.indexOf(event.key)];
    if (!shifts) return;

    var destination = tableInput.rows[row + shifts[0]].cells[cell + shifts[1]];
    destination.focus();
  }
});

tableWiring.addEventListener("keydown", event => {
  if (!event.ctrlKey) return;

  var row = event.target.parentNode.rowIndex;
  var cell = event.target.cellIndex;

  var shifts = [[0, 1], [0, -1], [-(selectLoading.selectedIndex == 3 ? 1 : (row == 5 ? 2 : 1)), 0], [(selectLoading.selectedIndex == 3 ? 1 : (row == 3 ? 2 : 1)), 0]][arrows.indexOf(event.key)];
  if (!shifts) return;

  var destination = tableWiring.rows[row + shifts[0]].cells[cell + shifts[1]];
  destination.focus();
});

tableSort.addEventListener("keydown", event => {
  if (!event.ctrlKey) return;

  var row = event.target.parentNode.rowIndex;
  var cell = event.target.cellIndex;

  var shift = [1, -1][arrows.indexOf(event.key)];
  if (!shift) return;

  var destination = tableSort.rows[row].cells[cell + shift];
  destination.focus();
});

function setTableBeat(tableBeatValue) {
  var bpm = 3600 / tableBeatValue;
  spanTableBpm.textContent = isFinite(bpm) ? bpm.toFixed(3) : "";

  for (var i = 1; i <= tableLength; i ++) {
    calcNote(i);
  }
}

function clearTable(table, rows, start) {
  rows = Array.isArray(rows) ? rows : [rows];

  rows.forEach(row => {
    for (var i = start; i < tableLength; i ++) {
      table.rows[row].cells[i].textContent = "";
    }
  });
}

function changeTableInput() {
  clearTable(tableInput, [2, 3], 1);

  divTimeUnit.style.display = ["block", "none"][selectTableInput.selectedIndex];
}

function setTimeUnit() {
  for (var i = 1; i <= tableLength; i ++) {
    calcNote(i);
  }
}

function calcNote(cellIndex) {
  var beat = inputTableBeat.value;

  if (selectTableInput.selectedIndex == 0) {
    var cellIndex = isNum(cellIndex) ? cellIndex : this.cellIndex;
    var timeUnit = parseInt(inputTimeUnit.value);
    var targetTime = tableInput.rows[2].cells[cellIndex].textContent;

    if (!timeUnit || !beat || targetTime == "") {
      tableInput.rows[3].cells[cellIndex].textContent = "";
      return;
    }

    tableInput.rows[3].cells[cellIndex].textContent = beat * (targetTime / timeUnit);

  } else {
    var target = isNum(cellIndex) ? tableInput.rows[2].cells[cellIndex] : this;
    var parts = target.textContent.match(/[\+\-]*\d+(?:\.\d+)?\:*/g);

    if (target.textContent == "" || !beat || !parts) {
      tableInput.rows[3].cells[target.cellIndex].textContent = "";
      return;
    }

    var calNotes = 0;

    parts.forEach(part => {
      var note = beat * 4 / part.replace(/[\+\-\:]/g, "");
      note = 2 * note - note * (2 ** -(part.match(/\:/g) || []).length);

      calNotes += (part.startsWith("-") ? -1 : 1) * note;
    });

    tableInput.rows[3].cells[target.cellIndex].textContent = isFinite(calNotes) ? calNotes : "";
  }
}

var audioContext = new (window.AudioContext || window.webkitAudioContext)();
var instruments = ["sine", "triangle", "square", "sawtooth"];

function playSound(column) {
  var oscillator = audioContext.createOscillator();
  var gainNode = audioContext.createGain();

  oscillator.type = instruments[selectInstrument.selectedIndex];
  oscillator.frequency.setValueAtTime(440 * (2 ** ((18 - selectScale.selectedIndex + parseFloat(tableInput.rows[4].cells[column].textContent)) / 12)), audioContext.currentTime);
  oscillator.connect(gainNode);

  gainNode.gain.value = 0.2;
  gainNode.connect(audioContext.destination);

  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.1);
}

var stopFlag = false;

function resetPlay() {
  for (var j = 1; j <= tableLength; j ++) {
    tableInput.rows[0].cells[j].style.backgroundColor = "#ffffe0";
  }
}

var timeoutId;

function play() {
  stopFlag = false;

  var loop = () => {
    if (stopFlag) return;

    if (i > tableLength) {
      resetPlay();
      return;
    }

    var delay = tableInput.rows[3].cells[i].textContent;
    var height = tableInput.rows[4].cells[i].textContent;

    if (!isNum(delay, height)) {
      resetPlay();
      return;
    }

    if (isNum(height)) playSound(i);
    if (i >= 2) tableInput.rows[0].cells[i - 1].style.backgroundColor = "#ffffe0";
    tableInput.rows[0].cells[i].style.backgroundColor = "#98fb98";
    i ++;

    timeoutId = setTimeout(loop, delay * 50 / 3);
  }

  var i = 1;
  loop();
}

function stopPlay() {
  stopFlag = true;

  resetPlay();
  clearTimeout(timeoutId);
}

function changeLoading(selectedIndex) {
  divLoadingCycle.style.display = "none";

  switch (selectedIndex) {
    case 0:
    case 1:
      divLoadingAve.style.display = "none";
      selectLoadingInput.style.display = "none";

      tableWiring.rows[4].style.display = "none";
      break;

    case 2:
      divLoadingAve.style.display = "block";
      selectLoadingInput.style.display = "none";

      tableWiring.rows[4].style.display = "none";
      break;

    case 3:
      divLoadingAve.style.display = "block";
      selectLoadingInput.style.display = "inline-block";
      selectLoadingInput.selectedIndex = 1;

      tableWiring.rows[4].style.display = "table-row";
  }
}

function changeLoadingInput(selectedIndex) {
  switch (selectedIndex) {
    case 0:
      divLoadingAve.style.display = "none";
      divLoadingCycle.style.display = "none";
      break;

    case 1:
      divLoadingCycle.style.display = "none";
      divLoadingAve.style.display = "block";
      break;

    case 2:
      divLoadingAve.style.display = "none";
      divLoadingCycle.style.display = "block";
  }
}

function changeLanding(selectedIndex) {
  var firstDelay, pattern;
  var delays = [[10, 11, 11], [21, 21, 22]][wingInd];

  if (wingInd == 0) {
    switch (selectLanding.options[selectedIndex].text) {
      case "1v":
        firstDelay = 9;
        pattern = 1;
        break;

      case "2a":
      case "2b":
        firstDelay = 11;
        pattern = 2;
        break;

      case "3":
        firstDelay = 11;
        pattern = 0;
        break;

      case "1d":
      case "4a":
      case "4b":
        firstDelay = 10;
        pattern = 1;
    }

  } else {
    var index = selectLanding.options[selectedIndex].text[0] - 1;

    firstDelay = [17, 21, 22, 21][index];
    pattern = [1, 2, 0, 1][index];
  }

  tableWiring.rows[3].cells[2].textContent = firstDelay;

  for (var i = 3; i <= tableLength; i ++) {
    tableWiring.rows[3].cells[i].textContent = delays[(i + pattern) % 3];
  }
}

function setLoadingAve(loadingDelay) {
  if (selectLoading.selectedIndex == 3) {
    var text = isNum(loadingDelay) ? parseFloat(loadingDelay) : "";

    for (var i = 2; i <= tableLength; i ++) {
      tableWiring.rows[4].cells[i].textContent = text;
    }
  }
}

function setLoadingCycle(delays) {
  var delays = delays.split(",").map(delay => parseFloat(delay));

  if (isNum(...delays)) {
    for (var i = 2; i <= tableLength; i ++) {
      tableWiring.rows[4].cells[i].textContent = (delays[(i - 2) % delays.length]);
    }

  } else {
    clearTable(tableWiring, 4, 2);
  }
}

function organize() {
  var totalDelay = 0;

  for (var i = 1; i <= tableLength; i ++) {
    tableWiring.rows[2].cells[i].textContent = "";
    tableWiring.rows[5].cells[i].textContent = "";

    var delay = tableInput.rows[3].cells[i].textContent;
    var height = tableInput.rows[4].cells[i].textContent;

    if (isNum(delay, height)) {
      tableWiring.rows[2].cells[i].textContent = totalDelay;
      tableWiring.rows[5].cells[i].textContent = parseInt(height);

      totalDelay += parseFloat(delay);
    }
  }
}

function isWirable(target, height, column) {
  var near = 0, far = 0;
  target = Math.round(target);

  var startings = startingsList[wingInd];
  var gaps = gapsList[wingInd];

  var landingType = "general";
  var landing = selectLanding.options[selectLanding.selectedIndex].text;

  if (wingInd == 0 && ((["1v", "1d", "4a"].includes(landing) && column == 1) || (landing == "2a" && column == 0))) {
    landingType = "second";

  } else if (column == 0) {
    if (landing == "1v") landingType = "vertical";
    else if (landing == "1d") landingType = "diagonal";
  }

  var accelerations = accelerationsList[wingInd][landingType];
  var tolerance = target + accelerations[0] + 2;

  for (var i = 0; i < startings.length; i ++) {
    var starting = startings[i];
    if (starting.delay > tolerance || starting.down >= height) continue;

    for (var j = 0; j < gaps.length; j ++) {
      var gap0 = gaps[j];
      if (starting.delay + gap0.delay > tolerance || starting.down + gap0.down >= height) continue;

      for (var k = 0; k < gaps.length; k ++) {
        var gap1 = gaps[k];

        if (starting.delay + gap0.delay + gap1.delay > tolerance || starting.down + gap0.down + gap1.down >= height) continue;

        for (var l = 0; l < gaps.length; l ++) {
          var gap2 = gaps[l];
          var distance = height - (starting.down + gap0.down + gap1.down + gap2.down);

          if (distance <= 0) continue;

          var totalDelay = starting.delay + gap0.delay + gap1.delay + gap2.delay - (distance <= accelerations.length ? accelerations[distance - 1] : 0);

          switch (Math.abs(target - totalDelay)) {
            case 0:
              return 0;

            case 1:
              near = 1;
              break;

            case 2:
              far = 1;
          }
        }
      }
    }
  }

  if (near == 1) return 1;
  if (far == 1) return 2;
  return 3;
}

var sortableRange = 4;

function wiringSort() {
  var totalXDelay = 0;
  var wirings = [];

  for (var i = 1; i <= tableLength; i ++) {
    var delay = tableWiring.rows[2].cells[i].textContent;
    var xDelay = tableWiring.rows[3].cells[i].textContent;

    var xScrollDelay = selectLoading.selectedIndex == 3 ? tableWiring.rows[4].cells[i].textContent : 0;
    var yScrollDelay = 0;

    switch (selectLoading.selectedIndex) {
      case 1:
        yScrollDelay = -4;
        break;

      case 2:
        yScrollDelay = paeseFloat(inputLoadingAve.value);
    }

    var height = parseInt(tableWiring.rows[5].cells[i].textContent);

    var baseDelay = inputBaseDelay.value;
    var baseHeight = parseInt(inputBaseHeight.value) - parseInt(tableWiring.rows[5].cells[1].textContent);

    if (!isNum(delay, xDelay, xScrollDelay, height, baseDelay, baseHeight)) break;

    totalXDelay += (parseFloat(xDelay) + parseFloat(xScrollDelay));
    wirings.push({
      index: i,
      delay: parseFloat(baseDelay) + parseFloat(delay) - parseInt(height) * (yScrollDelay + 4),
      xDelay: totalXDelay,
      height: baseHeight + height
    });
  }

  if (!wirings.length) {
    if (isOverview) overview();
    return;
  }

  var evals = [];

  for (var i = 0; i < wirings.length; i ++) {
    evals[i] = evals[i] ?? isWirable(wirings[i].delay - wirings[i].xDelay, wirings[i].height, i);
    if (evals[i] == 0) continue;

    var backI = wirings.length - 1 - i;
    var shifts = [];

    for (var num = 1; num <= sortableRange; num ++) {
      if (i >= num) shifts.push(-num);
      if (backI >= num) shifts.push(num);
    };

    var movedEvals = [];
    var evalSums = [];

    shifts.forEach(shift => {
      if (shift > 0) evals[i + shift] = evals[i + shift] ?? isWirable(wirings[i + shift].delay - wirings[i + shift].xDelay, wirings[i + shift].height, i + shift);

      var current = isWirable(wirings[i].delay - wirings[i + shift].xDelay, wirings[i].height, i + shift);
      var destination = isWirable(wirings[i + shift].delay - wirings[i].xDelay, wirings[i + shift].height, i);

      movedEvals.push({shift, current, destination});
      evalSums.push(current + destination);
    });

    var movedEval = movedEvals[evalSums.indexOf(Math.min(...evalSums))];
    var shift = movedEval.shift;
    var current = movedEval.current;
    var destination = movedEval.destination;

    if (current + destination < evals[i] + evals[i + shift]) {
      [wirings[i], wirings[i + shift]] = [wirings[i + shift], wirings[i]];
      [wirings[i].xDelay, wirings[i + shift].xDelay] = [wirings[i + shift].xDelay, wirings[i].xDelay];

      evals[i] = destination;
      evals[i + shift] = current;
    }
  }

  clearTable(tableSort, [2, 3, 4], 1);

  for (var i = 1; i <= wirings.length; i ++) {
    var th = tableSort.rows[0].cells[i];
    var movedInd = wirings[i - 1].index;
    th.textContent = movedInd;
    th.style.backgroundColor = i == movedInd ? "#ffffe0" : "#ffedc4";

    tableSort.rows[2].cells[i].textContent = Math.round(wirings[i - 1].delay - wirings[i - 1].xDelay);
    tableSort.rows[3].cells[i].textContent = wirings[i - 1].height;
    tableSort.rows[4].cells[i].textContent = ["◎", "○", "△", "×"][evals[i - 1]];
  }

  var evalsCount = [0, 0, 0, 0];
  evals.forEach(e => evalsCount[e] ++);
  spanEvaluations.textContent = `◎: ${evalsCount[0]}, ○: ${evalsCount[1]}, △: ${evalsCount[2]}, ×: ${evalsCount[3]}`;

  if (isOverview) overview(true);
}

var selectedButton = 0;

function tableButton() {
  if (selectedButton != 0) tableSort.rows[5].cells[selectedButton].firstChild.style.backgroundColor = "";

  var button = this;
  var cellInd = button.parentNode.cellIndex;
  selectedButton = cellInd;

  button.style.backgroundColor = "#a8fb98";

  var delay = tableSort.rows[2].cells[cellInd].textContent;
  var height = tableSort.rows[3].cells[cellInd].textContent;
  var key = selectScale.options[selectScale.selectedIndex - (height - parseInt(inputBaseHeight.value))].text;

  var title = `
    列: ${cellInd},
    音階: ${key},
    遅延: ${delay},
    高さ: ${height}
  `;

  spanOverview.textContent = title;

  if (isNum(delay, height)) {
    inputTarget.value = delay;
    inputHeight.value = height;

    var landingInd = 0;
    var landing = selectLanding.options[selectLanding.selectedIndex].text;

    if (wingInd == 0 && ((["1v", "1d", "4a"].includes(landing) && cellInd == 2) || (landing == "2a" && cellInd == 1))) {
      landingInd = 1;

    } else if (cellInd == 1) {
      if (landing == "1v") landingInd = 2;
      else if (landing == "1d") landingInd = 3;
    }

    selectTargetWing.selectedIndex = wingInd;
    selectLandingShape.selectedIndex = landingInd;

    target();
  }
}

document.addEventListener("keydown", e => {
  if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
    if (selectedButton == 0) return;

    var shift = e.key == "ArrowLeft" ? -1 : 1;
    tableSort.rows[5].cells[selectedButton + shift].firstChild.click();
  }
});

var isOverview = false;

function overview(update) {
  if (!isOverview || update) {
    isOverview = true;

    var heights = [];

    for (var i = 1; i <= tableLength; i ++) {
      var height = tableSort.rows[3].cells[i].textContent;

      if (!isNum(height)) break;
      heights.push(height);
    }

    if (!heights.length) return;
    divOverview.style.display = "block";

    var maxHeight = Math.max(...heights);
    var tileX = heights.length;
    var tileY = maxHeight - Math.min(...heights) + 3;

    canvasOverview.width = 16 * tileX;
    canvasOverview.height = 16 * tileY;

    var distances = heights.map(height => maxHeight - height);
    var context = canvasOverview.getContext("2d");

    var space = new Image();
    space.src = `images/railParts/space.png`;

    space.onload = () => {
      context.globalAlpha = 0.6;

      for (var x = 0; x < tileX; x ++) {
        for (var y = 0; y < tileY; y ++) {
          context.drawImage(space, 16 * x, 16 * y, 16, 16);
        }
      }

      context.globalAlpha = 1;
    }

    var parts = [];

    for (var i = 0; i <= 2; i ++) {
      parts[i] = new Image();
      parts[i].src = `images/railParts/${["openU", "note", "openD"][i]}.png`;
    };

    parts[2].onload = () => {
      distances.forEach((distance, x) => {
        for (var i = 0; i <= 2; i ++) {
          context.drawImage(parts[i], 16 * x, 16 * (distance + i), 16, 16);
        }
      });

      context.imageSmoothingEnabled = false;
    }

  } else {
    isOverview = false;

    canvasOverview.height = 0;
    divOverview.style.display = "none";
  }
}

function getColumnOverviw(event) {
  var x = event.clientX - event.target.getBoundingClientRect().left;

  if (x < 0) x = 0;
  if (x > canvasOverview.width) x = canvasOverview.width;

  return parseInt(x / 16) + 1;
}

canvasOverview.addEventListener("click", event => {
  var column = getColumnOverviw(event);

  tableSort.rows[5].cells[column].firstChild.click();
});

function changeTargetWing(selectedIndex) {
  selectLandingShape[1].style.display = ["block", "none"][selectedIndex];
  if (selectedIndex == 1) selectLandingShape.selectedIndex = 0;
}

function target() {
  var same = [], near = [], far = [];

  var target = parseInt(inputTarget.value);
  var height = parseInt(inputHeight.value);
  if (!isNum(target, height)) return;

  var targetWingInd = selectTargetWing.selectedIndex;

  var startings = startingsList[targetWingInd];
  var gaps = gapsList[targetWingInd];

  var accelerations = accelerationsList[targetWingInd][selectLandingShape.value];
  var tolerance = target + accelerations[0] + 2;

  for (var i = 0; i < startings.length; i ++) {
    var starting = startings[i];
    if (starting.delay > tolerance || starting.down >= height) continue;

    for (var j = 0; j < gaps.length; j ++) {
      var gap0 = gaps[j];
      if (starting.delay + gap0.delay > tolerance || starting.down + gap0.down >= height) continue;

      for (var k = 0; k < gaps.length; k ++) {
        var gap1 = gaps[k];
        if (starting.delay + gap0.delay + gap1.delay > tolerance || starting.down + gap0.down + gap1.down >= height) continue;

        for (var l = 0; l < gaps.length; l ++) {
          var gap2 = gaps[l];
          var distance = height - (starting.down + gap0.down + gap1.down + gap2.down);

          if (distance <= 0) continue;

          var totalDelay = starting.delay + gap0.delay + gap1.delay + gap2.delay - (distance <= accelerations.length ? accelerations[distance - 1] : 0);
          var result = {
            delay: totalDelay,
            down: starting.down + gap0.down + gap1.down + gap2.down,
            up: starting.up,
            str: `${starting.str}${gap0.str}${gap1.str}${gap2.str}`
          };

          var error = Math.abs(target - totalDelay);
          if (error <= 2) [same, near, far][error].push(result);
        }
      }
    }
  }

  sort(same, near, far);
}

function sort(same, near, far) {
  var sorting = selectSort.selectedIndex;
  var direction = sorting <= 1 ? 0 : 1;
  var order = sorting % 2 == 0 ? 1 : -1;

  var resultsList = [same, near, far];

  [same, near, far] = resultsList.map(results => {
    return results.sort((a, b) => {
      var [a0, a1] = [[a.up, a.down], [a.up, a.down]][direction];
      var [b0, b1] = [[b.up, b.down], [b.up, b.down]][direction];

      if (a0 > b0) return order;
      if (a0 < b0) return -order;

      if (a1 > b1) return order;
      if (a1 < b1) return -order;

      return 0;
    });
  });

  var newSame = [], newNear = [], newFar = [];
  var newResultsList = [newSame, newNear, newFar];

  [same, near, far].forEach((results, i) => {
    results.forEach(result => {
      newResultsList[i].push(` (${result.delay}/${parseInt(result.up)}/${result.down}/${result.str})`);
    });
  });

  newSame = [...new Set(newSame)];
  newNear = [...new Set(newNear)];
  newFar = [...new Set(newFar)];

  [divSame, divNear, divFar].forEach((div, i) => {
    while (div.firstChild) div.removeChild(div.firstChild);

    [newSame, newNear, newFar][i].forEach(result => {
      var span = document.createElement("span");
      span.textContent = `${result},`;

      span.addEventListener("click", function(event) {
        var str = event.target.textContent.match(/[↑↓][^)]+\)/)[0].replace(")", "");

        var direction = str[0];
        var optsList = [];
        var parts = [];
        var partsIndex = ["noteU", "noteD", "space", "openU", "openD", "close", "connection", "middle"];

        str.slice(1).split("-").map(str => optsList.push(str.match(/[RGF]\d*/g) || []));

        if (direction == "↑") {
          optsList[0].forEach((option, i) => {
            switch (option[0]) {
              case "R":
                if (i == 0) {
                  if (option[1] == 0) {
                    parts.unshift(5);

                  } else {
                    parts.unshift(6);
                    [...Array(option[1] - 1)].map(() => parts.unshift(6, 7));
                    parts.unshift((i < optsList[0].length - 1 ? 3 : 5), 7);
                  }

                } else {
                  parts.unshift(4);
                  [...Array(option[1] - 1)].map(() => parts.unshift(6, 7));
                  parts.unshift((i < optsList[0].length - 1 ? 3 : 5), 7);
                }
                break;

              case "G":
                if (i == 0) parts.unshift(3);
                [...Array(option[1] - 1)].map(() => parts.unshift(2));
                break;

              case "F":
                if (i == 0) parts.unshift(3);
            }
          });

          parts.push(0);

        } else {
          parts.unshift(3);
          parts.push(1);
        }

        if (optsList[1] == "") parts.push(4);

        optsList[1].forEach((option, i) => {
          if (option[0] == "R") {
            parts.push(i == 0 ? 6 : 3);
            [...Array(option[1] - 1)].map(() => parts.push(7, 6));
            parts.push(7, 4);

          } else {
            if (i == 0) parts.push(4);
            [...Array(option.substring(1) - 1)].map(() => parts.push(2));
          }
        });

        var context = canvasWiring.getContext("2d");

        context.clearRect(0, 0, 32, 1000);
        canvasWiring.height = 32 * parts.length;

        parts.forEach((part, i) => {
          var image = new Image();
          image.src = `images/railParts/${partsIndex[`${part}`[0]]}.png`;

          image.onload = () => {
            context.drawImage(image, 0, 32 * i, 32, 32);
          }
        });

        context.imageSmoothingEnabled = false;
      });

      div.appendChild(span);
    });
  });

  if (checkWiringImage.checked) {
    if (divSame.firstChild) {
      divSame.firstChild.click();

    } else {
      canvasWiring.getContext("2d").clearRect(0, 0, 32, 1000);
      canvasWiring.height = 320;
    }
  }
}

var accelerationsList = [
  {
    general: [63],
    second: [63],
    vertical: [63],
    diagonal: [63]
  },
  {
    general: [17, 11, 7, 5, 3, 1],
    vertical: [18, 13, 10, 6, 4, 5, 5, 2, 1],
    diagonal: [18, 12, 9, 6, 4, 4, 3, 2, 1]
  }
];

var startingsList = [
  [
    {delay: 0, str: "↓-", down: 0, up: 0},
    {delay: -14, str: "↓-R1", down: 2, up: 0},
    {delay: -27, str: "↓-R2", down: 4, up: 0},
    {delay: -40, str: "↓-R3", down: 6, up: 0},
    {delay: -54, str: "↓-R4", down: 8, up: 0},
    {delay: -67, str: "↓-R5", down: 10, up: 0},
    {delay: -80, str: "↓-R6", down: 12, up: 0},

    {delay: 21, str: "↑R0-", down: 0, up: 0.1},
    {delay: 8, str: "↑R0-R1", down: 2, up: 0.1},
    {delay: -6, str: "↑R0-R2", down: 4, up: 0.1},
    {delay: -19, str: "↑R0-R3", down: 6, up: 0.1},
    {delay: -32, str: "↑R0-R4", down: 8, up: 0.1},
    {delay: -46, str: "↑R0-R5", down: 10, up: 0.1},
    {delay: -59, str: "↑R0-R6", down: 12, up: 0.1},

    {delay: 64, str: "↑R1-", down: 0, up: 2},
    {delay: 51, str: "↑R1-R1", down: 2, up: 2},
    {delay: 38, str: "↑R1-R2", down: 4, up: 2},
    {delay: 24, str: "↑R1-R3", down: 6, up: 2},
    {delay: 11, str: "↑R1-R4", down: 8, up: 2},
    {delay: -2, str: "↑R1-R5", down: 10, up: 2},
    {delay: -16, str: "↑R1-R6", down: 12, up: 2},

    {delay: 102, str: "↑G1R1-", down: 0, up: 3},
    {delay: 89, str: "↑G1R1-R1", down: 2, up: 3},
    {delay: 75, str: "↑G1R1-R2", down: 4, up: 3},
    {delay: 62, str: "↑G1R1-R3", down: 6, up: 3},
    {delay: 49, str: "↑G1R1-R4", down: 8, up: 3},
    {delay: 35, str: "↑G1R1-R5", down: 10, up: 3},
    {delay: 22, str: "↑G1R1-R6", down: 12, up: 3},

    {delay: 134, str: "↑G2R1-", down: 0, up: 4},
    {delay: 120, str: "↑G2R1-R1", down: 2, up: 4},
    {delay: 107, str: "↑G2R1-R2", down: 4, up: 4},
    {delay: 94, str: "↑G2R1-R3", down: 6, up: 4},
    {delay: 80, str: "↑G2R1-R4", down: 8, up: 4},
    {delay: 67, str: "↑G2R1-R5", down: 10, up: 4},
    {delay: 54, str: "↑G2R1-R6", down: 12, up: 4},

    {delay: 107, str: "↑R2-", down: 0, up: 4},
    {delay: 93, str: "↑R2-R1", down: 2, up: 4},
    {delay: 80, str: "↑R2-R2", down: 4, up: 4},
    {delay: 67, str: "↑R2-R3", down: 6, up: 4},
    {delay: 53, str: "↑R2-R4", down: 8, up: 4},
    {delay: 40, str: "↑R2-R5", down: 10, up: 4},
    {delay: 27, str: "↑R2-R6", down: 12, up: 4},

    {delay: 202, str: "↑F-", down: 0, up: 0.2},
    {delay: 189, str: "↑F-R1", down: 2, up: 0.2},
    {delay: 176, str: "↑F-R2", down: 4, up: 0.2},
    {delay: 162, str: "↑F-R3", down: 6, up: 0.2},
    {delay: 149, str: "↑F-R4", down: 8, up: 0.2},
    {delay: 136, str: "↑F-R5", down: 10, up: 0.2},
    {delay: 122, str: "↑F-R6", down: 12, up: 0.2},

    {delay: 168, str: "↑G3R1-", down: 0, up: 5},
    {delay: 155, str: "↑G3R1-R1", down: 2, up: 5},
    {delay: 142, str: "↑G3R1-R2", down: 4, up: 5},
    {delay: 128, str: "↑G3R1-R3", down: 6, up: 5},
    {delay: 115, str: "↑G3R1-R4", down: 8, up: 5},
    {delay: 102, str: "↑G3R1-R5", down: 10, up: 5},
    {delay: 88, str: "↑G3R1-R6", down: 12, up: 5},

    {delay: 135, str: "↑G1R2-", down: 0, up: 5},
    {delay: 122, str: "↑G1R2-R1", down: 2, up: 5},
    {delay: 109, str: "↑G1R2-R2", down: 4, up: 5},
    {delay: 95, str: "↑G1R2-R3", down: 6, up: 5},
    {delay: 82, str: "↑G1R2-R4", down: 8, up: 5},
    {delay: 69, str: "↑G1R2-R5", down: 10, up: 5},
    {delay: 55, str: "↑G1R2-R6", down: 12, up: 5},

    {delay: 136, str: "↑R1G1R1-", down: 0, up: 5},
    {delay: 123, str: "↑R1G1R1-R1", down: 2, up: 5},
    {delay: 109, str: "↑R1G1R1-R2", down: 4, up: 5},
    {delay: 96, str: "↑R1G1R1-R3", down: 6, up: 5},
    {delay: 83, str: "↑R1G1R1-R4", down: 8, up: 5},
    {delay: 69, str: "↑R1G1R1-R5", down: 10, up: 5},
    {delay: 56, str: "↑R1G1R1-R6", down: 12, up: 5},

    {delay: 166, str: "↑G2R2-", down: 0, up: 6},
    {delay: 152, str: "↑G2R2-R1", down: 2, up: 6},
    {delay: 139, str: "↑G2R2-R2", down: 4, up: 6},
    {delay: 126, str: "↑G2R2-R3", down: 6, up: 6},
    {delay: 112, str: "↑G2R2-R4", down: 8, up: 6},
    {delay: 99, str: "↑G2R2-R5", down: 10, up: 6},
    {delay: 86, str: "↑G2R2-R6", down: 12, up: 6},

    {delay: 149, str: "↑R3-", down: 0, up: 6},
    {delay: 136, str: "↑R3-R1", down: 2, up: 6},
    {delay: 122, str: "↑R3-R2", down: 4, up: 6},
    {delay: 109, str: "↑R3-R3", down: 6, up: 6},
    {delay: 96, str: "↑R3-R4", down: 8, up: 6},
    {delay: 82, str: "↑R3-R5", down: 10, up: 6},
    {delay: 69, str: "↑R3-R6", down: 12, up: 6},

    {delay: 205, str: "↑G1R1G2R1-", down: 0, up: 7},
    {delay: 192, str: "↑G1R1G2R1-R1", down: 2, up: 7},
    {delay: 179, str: "↑G1R1G2R1-R2", down: 4, up: 7},
    {delay: 165, str: "↑G1R1G2R1-R3", down: 6, up: 7},
    {delay: 152, str: "↑G1R1G2R1-R4", down: 8, up: 7},
    {delay: 139, str: "↑G1R1G2R1-R5", down: 10, up: 7},
    {delay: 125, str: "↑G1R1G2R1-R6", down: 12, up: 7},

    {delay: 206, str: "↑G2R1G1R1-", down: 0, up: 7},
    {delay: 192, str: "↑G2R1G1R1-R1", down: 2, up: 7},
    {delay: 180, str: "↑G2R1G1R1-R2", down: 4, up: 7},
    {delay: 166, str: "↑G2R1G1R1-R3", down: 6, up: 7},
    {delay: 152, str: "↑G2R1G1R1-R4", down: 8, up: 7},
    {delay: 139, str: "↑G2R1G1R1-R5", down: 10, up: 7},
    {delay: 126, str: "↑G2R1G1R1-R6", down: 12, up: 7},

    {delay: 212, str: "↑G3R2-", down: 0, up: 7},
    {delay: 199, str: "↑G3R2-R1", down: 2, up: 7},
    {delay: 186, str: "↑G3R2-R2", down: 4, up: 7},
    {delay: 172, str: "↑G3R2-R3", down: 6, up: 7},
    {delay: 159, str: "↑G3R2-R4", down: 8, up: 7},
    {delay: 146, str: "↑G3R2-R5", down: 10, up: 7},
    {delay: 131, str: "↑G3R2-R6", down: 12, up: 7},

    {delay: 217, str: "↑R1G3R1-", down: 0, up: 7},
    {delay: 204, str: "↑R1G3R1-R1", down: 2, up: 7},
    {delay: 190, str: "↑R1G3R1-R2", down: 4, up: 7},
    {delay: 177, str: "↑R1G3R1-R3", down: 6, up: 7},
    {delay: 164, str: "↑R1G3R1-R4", down: 8, up: 7},
    {delay: 150, str: "↑R1G3R1-R5", down: 10, up: 7},
    {delay: 136, str: "↑R1G3R1-R6", down: 12, up: 7},

    {delay: 233, str: "↑R1F-", down: 0, up: 2},
    {delay: 220, str: "↑R1F-R1", down: 2, up: 2},
    {delay: 206, str: "↑R1F-R2", down: 4, up: 2},
    {delay: 193, str: "↑R1F-R3", down: 6, up: 2},
    {delay: 180, str: "↑R1F-R4", down: 8, up: 2},
    {delay: 166, str: "↑R1F-R5", down: 10, up: 2},
    {delay: 153, str: "↑R1F-R6", down: 12, up: 2},

    {delay: 167, str: "↑R1G2R1-", down: 0, up: 6},
    {delay: 154, str: "↑R1G2R1-R1", down: 2, up: 6},
    {delay: 141, str: "↑R1G2R1-R2", down: 4, up: 6},
    {delay: 127, str: "↑R1G2R1-R3", down: 6, up: 6},
    {delay: 114, str: "↑R1G2R1-R4", down: 8, up: 6},
    {delay: 101, str: "↑R1G2R1-R5", down: 10, up: 6},
    {delay: 87, str: "↑R1G2R1-R6", down: 12, up: 6},

    {delay: 176, str: "↑G1R3-", down: 0, up: 7},
    {delay: 163, str: "↑G1R3-R1", down: 2, up: 7},
    {delay: 150, str: "↑G1R3-R2", down: 4, up: 7},
    {delay: 136, str: "↑G1R3-R3", down: 6, up: 7},
    {delay: 123, str: "↑G1R3-R4", down: 8, up: 7},
    {delay: 110, str: "↑G1R3-R5", down: 10, up: 7},
    {delay: 96, str: "↑G1R3-R6", down: 12, up: 7},

    {delay: 237, str: "↑G2R1G2R1-", down: 0, up: 8},
    {delay: 223, str: "↑G2R1G2R1-R1", down: 2, up: 8},
    {delay: 210, str: "↑G2R1G2R1-R2", down: 4, up: 8},
    {delay: 197, str: "↑G2R1G2R1-R3", down: 6, up: 8},
    {delay: 183, str: "↑G2R1G2R1-R4", down: 8, up: 8},
    {delay: 170, str: "↑G2R1G2R1-R5", down: 10, up: 8},
    {delay: 157, str: "↑G2R1G2R1-R6", down: 12, up: 8},

    {delay: 177, str: "↑R1G1R2-", down: 0, up: 5},
    {delay: 164, str: "↑R1G1R2-R1", down: 2, up: 5},
    {delay: 150, str: "↑R1G1R2-R2", down: 4, up: 5},
    {delay: 137, str: "↑R1G1R2-R3", down: 6, up: 5},
    {delay: 124, str: "↑R1G1R2-R4", down: 8, up: 5},
    {delay: 110, str: "↑R1G1R2-R5", down: 10, up: 5},
    {delay: 97, str: "↑R1G1R2-R6", down: 12, up: 5},

    {delay: 176, str: "↑R2G1R1-", down: 0, up: 5},
    {delay: 162, str: "↑R2G1R1-R1", down: 2, up: 5},
    {delay: 149, str: "↑R2G1R1-R2", down: 4, up: 5},
    {delay: 136, str: "↑R2G1R1-R3", down: 6, up: 5},
    {delay: 122, str: "↑R2G1R1-R4", down: 8, up: 5},
    {delay: 109, str: "↑R2G1R1-R5", down: 10, up: 5},
    {delay: 96, str: "↑R2G1R1-R6", down: 12, up: 5},

    {delay: 288, str: "↑G1R1F-", down: 0, up: 3},
    {delay: 275, str: "↑G1R1F-R1", down: 2, up: 3},
    {delay: 262, str: "↑G1R1F-R2", down: 4, up: 3},
    {delay: 248, str: "↑G1R1F-R3", down: 6, up: 3},
    {delay: 235, str: "↑G1R1F-R4", down: 8, up: 3},
    {delay: 222, str: "↑G1R1F-R5", down: 10, up: 3},
    {delay: 208, str: "↑G1R1F-R6", down: 12, up: 3},

    {delay: 211, str: "↑G2R3-", down: 0, up: 8},
    {delay: 197, str: "↑G2R3-R1", down: 2, up: 8},
    {delay: 184, str: "↑G2R3-R2", down: 4, up: 8},
    {delay: 171, str: "↑G2R3-R3", down: 6, up: 8},
    {delay: 157, str: "↑G2R3-R4", down: 8, up: 8},
    {delay: 144, str: "↑G2R3-R5", down: 10, up: 8},
    {delay: 131, str: "↑G2R3-R6", down: 12, up: 8},

    {delay: 212, str: "↑R1G2R2-", down: 0, up: 8},
    {delay: 199, str: "↑R1G2R2-R1", down: 2, up: 8},
    {delay: 186, str: "↑R1G2R2-R2", down: 4, up: 8},
    {delay: 172, str: "↑R1G2R2-R3", down: 6, up: 8},
    {delay: 159, str: "↑R1G2R2-R4", down: 8, up: 8},
    {delay: 146, str: "↑R1G2R2-R5", down: 10, up: 8},
    {delay: 132, str: "↑R1G2R2-R6", down: 12, up: 8},

    {delay: 211, str: "↑R2G2R1-", down: 0, up: 8},
    {delay: 198, str: "↑R2G2R1-R1", down: 2, up: 8},
    {delay: 184, str: "↑R2G2R1-R2", down: 4, up: 8},
    {delay: 171, str: "↑R2G2R1-R3", down: 6, up: 8},
    {delay: 158, str: "↑R2G2R1-R4", down: 8, up: 8},
    {delay: 144, str: "↑R2G2R1-R5", down: 10, up: 8},
    {delay: 131, str: "↑R2G2R1-R6", down: 12, up: 8},

    {delay: 299, str: "↑R2F-", down: 0, up: 4},
    {delay: 285, str: "↑R2F-R1", down: 2, up: 4},
    {delay: 272, str: "↑R2F-R2", down: 4, up: 4},
    {delay: 259, str: "↑R2F-R3", down: 6, up: 4},
    {delay: 245, str: "↑R2F-R4", down: 8, up: 4},
    {delay: 232, str: "↑R2F-R5", down: 10, up: 4},
    {delay: 219, str: "↑R2F-R6", down: 12, up: 4},

    {delay: 192, str: "↑R4-", down: 0, up: 8},
    {delay: 178, str: "↑R4-R1", down: 2, up: 8},
    {delay: 165, str: "↑R4-R2", down: 4, up: 8},
    {delay: 152, str: "↑R4-R3", down: 6, up: 8},
    {delay: 138, str: "↑R4-R4", down: 8, up: 8},
    {delay: 125, str: "↑R4-R5", down: 10, up: 8},
    {delay: 112, str: "↑R4-R6", down: 12, up: 8},

    {delay: 235, str: "↑R5-", down: 0, up: 10},
    {delay: 222, str: "↑R5-R1", down: 2, up: 10},
    {delay: 209, str: "↑R5-R2", down: 4, up: 10},
    {delay: 195, str: "↑R5-R3", down: 6, up: 10},
    {delay: 182, str: "↑R5-R4", down: 8, up: 10},
    {delay: 169, str: "↑R5-R5", down: 10, up: 10},
    {delay: 155, str: "↑R5-R6", down: 12, up: 10},

    {delay: 297, str: "↑G2R1G3R1-", down: 0, up: 9},
    {delay: 283, str: "↑G2R1G3R1-R1", down: 2, up: 9},
    {delay: 270, str: "↑G2R1G3R1-R2", down: 4, up: 9},
    {delay: 257, str: "↑G2R1G3R1-R3", down: 6, up: 9},
    {delay: 243, str: "↑G2R1G3R1-R4", down: 8, up: 9},
    {delay: 230, str: "↑G2R1G3R1-R5", down: 10, up: 9},
    {delay: 217, str: "↑G2R1G3R1-R6", down: 12, up: 9},

    {delay: 297, str: "↑G3R1G2R1-", down: 0, up: 9},
    {delay: 284, str: "↑G3R1G2R1-R1", down: 2, up: 9},
    {delay: 271, str: "↑G3R1G2R1-R2", down: 4, up: 9},
    {delay: 257, str: "↑G3R1G2R1-R3", down: 6, up: 9},
    {delay: 244, str: "↑G3R1G2R1-R4", down: 8, up: 9},
    {delay: 231, str: "↑G3R1G2R1-R5", down: 10, up: 9},
    {delay: 217, str: "↑G3R1G2R1-R6", down: 12, up: 9},

    {delay: 352, str: "↑R3F-", down: 0, up: 6},
    {delay: 339, str: "↑R3F-R1", down: 2, up: 6},
    {delay: 326, str: "↑R3F-R2", down: 4, up: 6},
    {delay: 312, str: "↑R3F-R3", down: 6, up: 6},
    {delay: 299, str: "↑R3F-R4", down: 8, up: 6},
    {delay: 286, str: "↑R3F-R5", down: 10, up: 6},
    {delay: 272, str: "↑R3F-R6", down: 12, up: 6},

    {delay: 328, str: "↑G2R1F-", down: 0, up: 4},
    {delay: 314, str: "↑G2R1F-R1", down: 2, up: 4},
    {delay: 301, str: "↑G2R1F-R2", down: 4, up: 4},
    {delay: 288, str: "↑G2R1F-R3", down: 6, up: 4},
    {delay: 274, str: "↑G2R1F-R4", down: 8, up: 4},
    {delay: 261, str: "↑G2R1F-R5", down: 10, up: 4},
    {delay: 248, str: "↑G2R1F-R6", down: 12, up: 4},

    {delay: 382, str: "↑G3R1F-", down: 0, up: 5},
    {delay: 369, str: "↑G3R1F-R1", down: 2, up: 5},
    {delay: 356, str: "↑G3R1F-R2", down: 4, up: 5},
    {delay: 342, str: "↑G3R1F-R3", down: 6, up: 5},
    {delay: 329, str: "↑G3R1F-R4", down: 8, up: 5},
    {delay: 316, str: "↑G3R1F-R5", down: 10, up: 5},
    {delay: 302, str: "↑G3R1F-R6", down: 12, up: 5},

    {delay: 249, str: "↑G1R2G2R1-", down: 0, up: 9},
    {delay: 236, str: "↑G1R2G2R1-R1", down: 2, up: 9},
    {delay: 223, str: "↑G1R2G2R1-R2", down: 4, up: 9},
    {delay: 209, str: "↑G1R2G2R1-R3", down: 6, up: 9},
    {delay: 196, str: "↑G1R2G2R1-R4", down: 8, up: 9},
    {delay: 183, str: "↑G1R2G2R1-R5", down: 10, up: 9},
    {delay: 169, str: "↑G1R2G2R1-R6", down: 12, up: 9},

    {delay: 248, str: "↑G2R1G1R2-", down: 0, up: 9},
    {delay: 234, str: "↑G2R1G1R2-R1", down: 2, up: 9},
    {delay: 221, str: "↑G2R1G1R2-R2", down: 4, up: 9},
    {delay: 208, str: "↑G2R1G1R2-R3", down: 6, up: 9},
    {delay: 194, str: "↑G2R1G1R2-R4", down: 8, up: 9},
    {delay: 181, str: "↑G2R1G1R2-R5", down: 10, up: 9},
    {delay: 168, str: "↑G2R1G1R2-R6", down: 12, up: 9},

    {delay: 264, str: "↑G3R3-", down: 0, up: 9},
    {delay: 251, str: "↑G3R3-R1", down: 2, up: 9},
    {delay: 238, str: "↑G3R3-R2", down: 4, up: 9},
    {delay: 224, str: "↑G3R3-R3", down: 6, up: 9},
    {delay: 211, str: "↑G3R3-R4", down: 8, up: 9},
    {delay: 198, str: "↑G3R3-R5", down: 10, up: 9},
    {delay: 184, str: "↑G3R3-R6", down: 12, up: 9},

    {delay: 265, str: "↑R1G3R2-", down: 0, up: 9},
    {delay: 252, str: "↑R1G3R2-R1", down: 2, up: 9},
    {delay: 238, str: "↑R1G3R2-R2", down: 4, up: 9},
    {delay: 225, str: "↑R1G3R2-R3", down: 6, up: 9},
    {delay: 212, str: "↑R1G3R2-R4", down: 8, up: 9},
    {delay: 198, str: "↑R1G3R2-R5", down: 10, up: 9},
    {delay: 185, str: "↑R1G3R2-R6", down: 12, up: 9},

    {delay: 266, str: "↑R2G3R1-", down: 0, up: 9},
    {delay: 252, str: "↑R2G3R1-R1", down: 2, up: 9},
    {delay: 239, str: "↑R2G3R1-R2", down: 4, up: 9},
    {delay: 226, str: "↑R2G3R1-R3", down: 6, up: 9},
    {delay: 212, str: "↑R2G3R1-R4", down: 8, up: 9},
    {delay: 199, str: "↑R2G3R1-R5", down: 10, up: 9},
    {delay: 186, str: "↑R2G3R1-R6", down: 12, up: 9},

    {delay: 222, str: "↑R1G1R3-", down: 0, up: 9},
    {delay: 209, str: "↑R1G1R3-R1", down: 2, up: 9},
    {delay: 195, str: "↑R1G1R3-R2", down: 4, up: 9},
    {delay: 182, str: "↑R1G1R3-R3", down: 6, up: 9},
    {delay: 169, str: "↑R1G1R3-R4", down: 8, up: 9},
    {delay: 155, str: "↑R1G1R3-R5", down: 10, up: 9},
    {delay: 142, str: "↑R1G1R3-R6", down: 12, up: 9},

    {delay: 221, str: "↑R2G1R2-", down: 0, up: 9},
    {delay: 207, str: "↑R2G1R2-R1", down: 2, up: 9},
    {delay: 194, str: "↑R2G1R2-R2", down: 4, up: 9},
    {delay: 181, str: "↑R2G1R2-R3", down: 6, up: 9},
    {delay: 167, str: "↑R2G1R2-R4", down: 8, up: 9},
    {delay: 154, str: "↑R2G1R2-R5", down: 10, up: 9},
    {delay: 141, str: "↑R2G1R2-R6", down: 12, up: 9},

    {delay: 338, str: "↑G1R2F-", down: 0, up: 5},
    {delay: 325, str: "↑G1R2F-R1", down: 2, up: 5},
    {delay: 312, str: "↑G1R2F-R2", down: 4, up: 5},
    {delay: 298, str: "↑G1R2F-R3", down: 6, up: 5},
    {delay: 285, str: "↑G1R2F-R4", down: 8, up: 5},
    {delay: 272, str: "↑G1R2F-R5", down: 10, up: 5},
    {delay: 258, str: "↑G1R2F-R6", down: 12, up: 5},

    {delay: 380, str: "↑G2R2F-", down: 0, up: 6},
    {delay: 366, str: "↑G2R2F-R1", down: 2, up: 6},
    {delay: 353, str: "↑G2R2F-R2", down: 4, up: 6},
    {delay: 340, str: "↑G2R2F-R3", down: 6, up: 6},
    {delay: 326, str: "↑G2R2F-R4", down: 8, up: 6},
    {delay: 313, str: "↑G2R2F-R5", down: 10, up: 6},
    {delay: 300, str: "↑G2R2F-R6", down: 12, up: 6},

    {delay: 381, str: "↑R1G2R1F-", down: 0, up: 6},
    {delay: 368, str: "↑R1G2R1F-R1", down: 2, up: 6},
    {delay: 355, str: "↑R1G2R1F-R2", down: 4, up: 6},
    {delay: 341, str: "↑R1G2R1F-R3", down: 6, up: 6},
    {delay: 328, str: "↑R1G2R1F-R4", down: 8, up: 6},
    {delay: 315, str: "↑R1G2R1F-R5", down: 10, up: 6},
    {delay: 301, str: "↑R1G2R1F-R6", down: 12, up: 6}
  ],
  [
    {delay: 0, str: "↓-", down: 0, up: 0},
    {delay: 35, str: "↓-R1", down: 2, up: 0},
    {delay: 69, str: "↓-R2", down: 4, up: 0},
    {delay: 104, str: "↓-R3", down: 6, up: 0},
    {delay: 139, str: "↓-R4", down: 8, up: 0},
    {delay: 173, str: "↓-R5", down: 10, up: 0},
    {delay: 208, str: "↓-R6", down: 12, up: 0},

    {delay: 42, str: "↑R0-", down: 0, up: 0},
    {delay: 77, str: "↑R0-R1", down: 2, up: 0},
    {delay: 112, str: "↑R0-R2", down: 4, up: 0},
    {delay: 146, str: "↑R0-R3", down: 6, up: 0},
    {delay: 181, str: "↑R0-R4", down: 8, up: 0},
    {delay: 216, str: "↑R0-R5", down: 10, up: 0},
    {delay: 250, str: "↑R0-R6", down: 12, up: 0},

    {delay: 88, str: "↑F-", down: 0, up: 0},
    {delay: 122, str: "↑F-R1", down: 2, up: 0},
    {delay: 157, str: "↑F-R2", down: 4, up: 0},
    {delay: 192, str: "↑F-R3", down: 6, up: 0},
    {delay: 226, str: "↑F-R4", down: 8, up: 0},
    {delay: 261, str: "↑F-R5", down: 10, up: 0},
    {delay: 296, str: "↑F-R6", down: 12, up: 0},

    {delay: 127, str: "↑R1-", down: 0, up: 2},
    {delay: 162, str: "↑R1-R1", down: 2, up: 2},
    {delay: 197, str: "↑R1-R2", down: 4, up: 2},
    {delay: 231, str: "↑R1-R3", down: 6, up: 2},
    {delay: 266, str: "↑R1-R4", down: 8, up: 2},
    {delay: 301, str: "↑R1-R5", down: 10, up: 2},
    {delay: 335, str: "↑R1-R6", down: 12, up: 2},

    {delay: 173, str: "↑R1F-", down: 0, up: 2},
    {delay: 208, str: "↑R1F-R1", down: 2, up: 2},
    {delay: 243, str: "↑R1F-R2", down: 4, up: 2},
    {delay: 277, str: "↑R1F-R3", down: 6, up: 2},
    {delay: 312, str: "↑R1F-R4", down: 8, up: 2},
    {delay: 347, str: "↑R1F-R5", down: 10, up: 2},
    {delay: 381, str: "↑R1F-R6", down: 12, up: 2},

    {delay: 212, str: "↑R2-", down: 0, up: 4},
    {delay: 247, str: "↑R2-R1", down: 2, up: 4},
    {delay: 282, str: "↑R2-R2", down: 4, up: 4},
    {delay: 316, str: "↑R2-R3", down: 6, up: 4},
    {delay: 351, str: "↑R2-R4", down: 8, up: 4},
    {delay: 386, str: "↑R2-R5", down: 10, up: 4},
    {delay: 420, str: "↑R2-R6", down: 12, up: 4},

    {delay: 257, str: "↑R2F-", down: 0, up: 4},
    {delay: 292, str: "↑R2F-R1", down: 2, up: 4},
    {delay: 327, str: "↑R2F-R2", down: 4, up: 4},
    {delay: 361, str: "↑R2F-R3", down: 6, up: 4},
    {delay: 396, str: "↑R2F-R4", down: 8, up: 4},
    {delay: 431, str: "↑R2F-R5", down: 10, up: 4},
    {delay: 465, str: "↑R2F-R6", down: 12, up: 4},

    {delay: 298, str: "↑R3-", down: 0, up: 6},
    {delay: 333, str: "↑R3-R1", down: 2, up: 6},
    {delay: 368, str: "↑R3-R2", down: 4, up: 6},
    {delay: 402, str: "↑R3-R3", down: 6, up: 6},
    {delay: 437, str: "↑R3-R4", down: 8, up: 6},
    {delay: 472, str: "↑R3-R5", down: 10, up: 6},
    {delay: 506, str: "↑R3-R6", down: 12, up: 6},

    {delay: 343, str: "↑R3F-", down: 0, up: 6},
    {delay: 378, str: "↑R3F-R1", down: 2, up: 6},
    {delay: 413, str: "↑R3F-R2", down: 4, up: 6},
    {delay: 447, str: "↑R3F-R3", down: 6, up: 6},
    {delay: 482, str: "↑R3F-R4", down: 8, up: 6},
    {delay: 517, str: "↑R3F-R5", down: 10, up: 6},
    {delay: 551, str: "↑R3F-R6", down: 12, up: 6},

    {delay: 383, str: "↑R4-", down: 0, up: 8},
    {delay: 418, str: "↑R4-R1", down: 2, up: 8},
    {delay: 453, str: "↑R4-R2", down: 4, up: 8},
    {delay: 487, str: "↑R4-R3", down: 6, up: 8},
    {delay: 522, str: "↑R4-R4", down: 8, up: 8},
    {delay: 557, str: "↑R4-R5", down: 10, up: 8},
    {delay: 591, str: "↑R4-R6", down: 12, up: 8},

    {delay: 429, str: "↑R4F-", down: 0, up: 8},
    {delay: 464, str: "↑R4F-R1", down: 2, up: 8},
    {delay: 499, str: "↑R4F-R2", down: 4, up: 8},
    {delay: 533, str: "↑R4F-R3", down: 6, up: 8},
    {delay: 568, str: "↑R4F-R4", down: 8, up: 8},

    {delay: 468, str: "↑R5-", down: 0, up: 10},
    {delay: 503, str: "↑R5-R1", down: 2, up: 10},
    {delay: 538, str: "↑R5-R2", down: 4, up: 10},
    {delay: 572, str: "↑R5-R3", down: 6, up: 10},

    {delay: 513, str: "↑R5F-", down: 0, up: 10},
    {delay: 548, str: "↑R5F-R1", down: 2, up: 10},
    {delay: 583, str: "↑R5F-R2", down: 4, up: 10},

    {delay: 169, str: "↑G1R1-", down: 0, up: 3},
    {delay: 203, str: "↑G1R1-R1", down: 2, up: 3},
    {delay: 238, str: "↑G1R1-R2", down: 4, up: 3},
    {delay: 273, str: "↑G1R1-R3", down: 6, up: 3},
    {delay: 307, str: "↑G1R1-R4", down: 8, up: 3},
    {delay: 342, str: "↑G1R1-R5", down: 10, up: 3},
    {delay: 377, str: "↑G1R1-R6", down: 12, up: 3},

    {delay: 215, str: "↑G1R1F-", down: 0, up: 3},
    {delay: 249, str: "↑G1R1F-R1", down: 2, up: 3},
    {delay: 284, str: "↑G1R1F-R2", down: 4, up: 3},
    {delay: 319, str: "↑G1R1F-R3", down: 6, up: 3},
    {delay: 353, str: "↑G1R1F-R4", down: 8, up: 3},
    {delay: 388, str: "↑G1R1F-R5", down: 10, up: 3},
    {delay: 423, str: "↑G1R1F-R6", down: 12, up: 3},

    {delay: 296, str: "↑G1R1G1R1-", down: 0, up: 6},
    {delay: 330, str: "↑G1R1G1R1-R1", down: 2, up: 6},
    {delay: 365, str: "↑G1R1G1R1-R2", down: 4, up: 6},
    {delay: 400, str: "↑G1R1G1R1-R3", down: 6, up: 6},
    {delay: 434, str: "↑G1R1G1R1-R4", down: 8, up: 6},
    {delay: 469, str: "↑G1R1G1R1-R5", down: 10, up: 6},
    {delay: 504, str: "↑G1R1G1R1-R6", down: 12, up: 6},

    {delay: 342, str: "↑G1R1G1R1F-", down: 0, up: 6},
    {delay: 376, str: "↑G1R1G1R1F-R1", down: 2, up: 6},
    {delay: 411, str: "↑G1R1G1R1F-R2", down: 4, up: 6},
    {delay: 446, str: "↑G1R1G1R1F-R3", down: 6, up: 6},
    {delay: 480, str: "↑G1R1G1R1F-R4", down: 8, up: 6},
    {delay: 515, str: "↑G1R1G1R1F-R5", down: 10, up: 6},
    {delay: 550, str: "↑G1R1G1R1F-R6", down: 12, up: 6},

    {delay: 381, str: "↑G1R1G1R2-", down: 0, up: 8},
    {delay: 415, str: "↑G1R1G1R2-R1", down: 2, up: 8},
    {delay: 450, str: "↑G1R1G1R2-R2", down: 4, up: 8},
    {delay: 485, str: "↑G1R1G1R2-R3", down: 6, up: 8},
    {delay: 519, str: "↑G1R1G1R2-R4", down: 8, up: 8},
    {delay: 554, str: "↑G1R1G1R2-R5", down: 10, up: 8},
    {delay: 589, str: "↑G1R1G1R2-R6", down: 12, up: 8},

    {delay: 426, str: "↑G1R1G1R2F-", down: 0, up: 8},
    {delay: 460, str: "↑G1R1G1R2F-R1", down: 2, up: 8},
    {delay: 495, str: "↑G1R1G1R2F-R2", down: 4, up: 8},
    {delay: 530, str: "↑G1R1G1R2F-R3", down: 6, up: 8},
    {delay: 564, str: "↑G1R1G1R2F-R4", down: 8, up: 8},
    {delay: 599, str: "↑G1R1G1R2F-R5", down: 10, up: 8},

    {delay: 254, str: "↑G1R2-", down: 0, up: 5},
    {delay: 288, str: "↑G1R2-R1", down: 2, up: 5},
    {delay: 323, str: "↑G1R2-R2", down: 4, up: 5},
    {delay: 358, str: "↑G1R2-R3", down: 6, up: 5},
    {delay: 392, str: "↑G1R2-R4", down: 8, up: 5},
    {delay: 427, str: "↑G1R2-R5", down: 10, up: 5},
    {delay: 462, str: "↑G1R2-R6", down: 12, up: 5},

    {delay: 299, str: "↑G1R2F-", down: 0, up: 5},
    {delay: 333, str: "↑G1R2F-R1", down: 2, up: 5},
    {delay: 368, str: "↑G1R2F-R2", down: 4, up: 5},
    {delay: 403, str: "↑G1R2F-R3", down: 6, up: 5},
    {delay: 437, str: "↑G1R2F-R4", down: 8, up: 5},
    {delay: 472, str: "↑G1R2F-R5", down: 10, up: 5},
    {delay: 507, str: "↑G1R2F-R6", down: 12, up: 5},

    {delay: 465, str: "↑G1R2G1R2-", down: 0, up: 10},
    {delay: 499, str: "↑G1R2G1R2-R1", down: 2, up: 10},
    {delay: 534, str: "↑G1R2G1R2-R2", down: 4, up: 10},
    {delay: 569, str: "↑G1R2G1R2-R3", down: 6, up: 10},

    {delay: 510, str: "↑G1R2G1R2F-", down: 0, up: 10},
    {delay: 544, str: "↑G1R2G1R2F-R1", down: 2, up: 10},
    {delay: 579, str: "↑G1R2G1R2F-R2", down: 4, up: 10},

    {delay: 340, str: "↑G1R3-", down: 0, up: 7},
    {delay: 374, str: "↑G1R3-R1", down: 2, up: 7},
    {delay: 409, str: "↑G1R3-R2", down: 4, up: 7},
    {delay: 444, str: "↑G1R3-R3", down: 6, up: 7},
    {delay: 478, str: "↑G1R3-R4", down: 8, up: 7},
    {delay: 513, str: "↑G1R3-R5", down: 10, up: 7},
    {delay: 548, str: "↑G1R3-R6", down: 12, up: 7},

    {delay: 385, str: "↑G1R3F-", down: 0, up: 7},
    {delay: 419, str: "↑G1R3F-R1", down: 2, up: 7},
    {delay: 454, str: "↑G1R3F-R2", down: 4, up: 7},
    {delay: 489, str: "↑G1R3F-R3", down: 6, up: 7},
    {delay: 523, str: "↑G1R3F-R4", down: 8, up: 7},
    {delay: 558, str: "↑G1R3F-R5", down: 10, up: 7},
    {delay: 593, str: "↑G1R3F-R6", down: 12, up: 7},

    {delay: 254, str: "↑R1G1R1-", down: 0, up: 5},
    {delay: 289, str: "↑R1G1R1-R1", down: 2, up: 5},
    {delay: 324, str: "↑R1G1R1-R2", down: 4, up: 5},
    {delay: 358, str: "↑R1G1R1-R3", down: 6, up: 5},
    {delay: 393, str: "↑R1G1R1-R4", down: 8, up: 5},
    {delay: 428, str: "↑R1G1R1-R5", down: 10, up: 5},
    {delay: 462, str: "↑R1G1R1-R6", down: 12, up: 5},

    {delay: 300, str: "↑R1G1R1F-", down: 0, up: 5},
    {delay: 335, str: "↑R1G1R1F-R1", down: 2, up: 5},
    {delay: 370, str: "↑R1G1R1F-R2", down: 4, up: 5},
    {delay: 404, str: "↑R1G1R1F-R3", down: 6, up: 5},
    {delay: 439, str: "↑R1G1R1F-R4", down: 8, up: 5},
    {delay: 474, str: "↑R1G1R1F-R5", down: 10, up: 5},
    {delay: 508, str: "↑R1G1R1F-R6", down: 12, up: 5},

    {delay: 381, str: "↑R1G1R1G1R1-", down: 0, up: 8},
    {delay: 416, str: "↑R1G1R1G1R1-R1", down: 2, up: 8},
    {delay: 451, str: "↑R1G1R1G1R1-R2", down: 4, up: 8},
    {delay: 485, str: "↑R1G1R1G1R1-R3", down: 6, up: 8},
    {delay: 520, str: "↑R1G1R1G1R1-R4", down: 8, up: 8},
    {delay: 555, str: "↑R1G1R1G1R1-R5", down: 10, up: 8},
    {delay: 589, str: "↑R1G1R1G1R1-R6", down: 12, up: 8},

    {delay: 427, str: "↑R1G1R1G1R1F-", down: 0, up: 8},
    {delay: 462, str: "↑R1G1R1G1R1F-R1", down: 2, up: 8},
    {delay: 497, str: "↑R1G1R1G1R1F-R2", down: 4, up: 8},
    {delay: 531, str: "↑R1G1R1G1R1F-R3", down: 6, up: 8},
    {delay: 566, str: "↑R1G1R1G1R1F-R4", down: 8, up: 8},

    {delay: 466, str: "↑R1G1R1G1R2-", down: 0, up: 10},
    {delay: 501, str: "↑R1G1R1G1R2-R1", down: 2, up: 10},
    {delay: 536, str: "↑R1G1R1G1R2-R2", down: 4, up: 10},
    {delay: 570, str: "↑R1G1R1G1R2-R3", down: 6, up: 10},

    {delay: 511, str: "↑R1G1R1G1R2F-", down: 0, up: 10},
    {delay: 546, str: "↑R1G1R1G1R2F-R1", down: 2, up: 10},
    {delay: 581, str: "↑R1G1R1G1R2F-R2", down: 4, up: 10},

    {delay: 339, str: "↑R1G1R2-", down: 0, up: 7},
    {delay: 374, str: "↑R1G1R2-R1", down: 2, up: 7},
    {delay: 409, str: "↑R1G1R2-R2", down: 4, up: 7},
    {delay: 443, str: "↑R1G1R2-R3", down: 6, up: 7},
    {delay: 478, str: "↑R1G1R2-R4", down: 8, up: 7},
    {delay: 513, str: "↑R1G1R2-R5", down: 10, up: 7},
    {delay: 547, str: "↑R1G1R2-R6", down: 12, up: 7},

    {delay: 384, str: "↑R1G1R2F-", down: 0, up: 7},
    {delay: 419, str: "↑R1G1R2F-R1", down: 2, up: 7},
    {delay: 454, str: "↑R1G1R2F-R2", down: 4, up: 7},
    {delay: 488, str: "↑R1G1R2F-R3", down: 6, up: 7},
    {delay: 523, str: "↑R1G1R2F-R4", down: 8, up: 7},
    {delay: 558, str: "↑R1G1R2F-R5", down: 10, up: 7},
    {delay: 592, str: "↑R1G1R2F-R6", down: 12, up: 7},

    {delay: 465, str: "↑R1G1R2G1R1-", down: 0, up: 10},
    {delay: 500, str: "↑R1G1R2G1R1-R1", down: 2, up: 10},
    {delay: 535, str: "↑R1G1R2G1R1-R2", down: 4, up: 10},
    {delay: 569, str: "↑R1G1R2G1R1-R3", down: 6, up: 10},

    {delay: 511, str: "↑R1G1R2G1R1F-", down: 0, up: 10},
    {delay: 546, str: "↑R1G1R2G1R1F-R1", down: 2, up: 10},
    {delay: 581, str: "↑R1G1R2G1R1F-R2", down: 4, up: 10},

    {delay: 425, str: "↑R1G1R3-", down: 0, up: 9},
    {delay: 460, str: "↑R1G1R3-R1", down: 2, up: 9},
    {delay: 495, str: "↑R1G1R3-R2", down: 4, up: 9},
    {delay: 529, str: "↑R1G1R3-R3", down: 6, up: 9},
    {delay: 564, str: "↑R1G1R3-R4", down: 8, up: 9},
    {delay: 599, str: "↑R1G1R3-R5", down: 10, up: 9},

    {delay: 470, str: "↑R1G1R3F-", down: 0, up: 9},
    {delay: 505, str: "↑R1G1R3F-R1", down: 2, up: 9},
    {delay: 540, str: "↑R1G1R3F-R2", down: 4, up: 9},
    {delay: 574, str: "↑R1G1R3F-R3", down: 6, up: 9},

    {delay: 338, str: "↑R2G1R1-", down: 0, up: 7},
    {delay: 373, str: "↑R2G1R1-R1", down: 2, up: 7},
    {delay: 408, str: "↑R2G1R1-R2", down: 4, up: 7},
    {delay: 442, str: "↑R2G1R1-R3", down: 6, up: 7},
    {delay: 477, str: "↑R2G1R1-R4", down: 8, up: 7},
    {delay: 512, str: "↑R2G1R1-R5", down: 10, up: 7},
    {delay: 546, str: "↑R2G1R1-R6", down: 12, up: 7},

    {delay: 384, str: "↑R2G1R1F-", down: 0, up: 7},
    {delay: 419, str: "↑R2G1R1F-R1", down: 2, up: 7},
    {delay: 454, str: "↑R2G1R1F-R2", down: 4, up: 7},
    {delay: 488, str: "↑R2G1R1F-R3", down: 6, up: 7},
    {delay: 523, str: "↑R2G1R1F-R4", down: 8, up: 7},
    {delay: 558, str: "↑R2G1R1F-R5", down: 10, up: 7},
    {delay: 592, str: "↑R2G1R1F-R6", down: 12, up: 7},

    {delay: 465, str: "↑R2G1R1G1R1-", down: 0, up: 10},
    {delay: 500, str: "↑R2G1R1G1R1-R1", down: 2, up: 10},
    {delay: 535, str: "↑R2G1R1G1R1-R2", down: 4, up: 10},
    {delay: 569, str: "↑R2G1R1G1R1-R3", down: 6, up: 10},

    {delay: 511, str: "↑R2G1R1G1R1F-", down: 0, up: 10},
    {delay: 546, str: "↑R2G1R1G1R1F-R1", down: 2, up: 10},
    {delay: 581, str: "↑R2G1R1G1R1F-R2", down: 4, up: 10},

    {delay: 423, str: "↑R2G1R2-", down: 0, up: 9},
    {delay: 458, str: "↑R2G1R2-R1", down: 2, up: 9},
    {delay: 493, str: "↑R2G1R2-R2", down: 4, up: 9},
    {delay: 527, str: "↑R2G1R2-R3", down: 6, up: 9},
    {delay: 562, str: "↑R2G1R2-R4", down: 8, up: 9},
    {delay: 597, str: "↑R2G1R2-R5", down: 10, up: 9},

    {delay: 468, str: "↑R2G1R2F-", down: 0, up: 9},
    {delay: 503, str: "↑R2G1R2F-R1", down: 2, up: 9},
    {delay: 538, str: "↑R2G1R2F-R2", down: 4, up: 9},
    {delay: 572, str: "↑R2G1R2F-R3", down: 6, up: 9},

    {delay: 424, str: "↑R3G1R1-", down: 0, up: 9},
    {delay: 459, str: "↑R3G1R1-R1", down: 2, up: 9},
    {delay: 494, str: "↑R3G1R1-R2", down: 4, up: 9},
    {delay: 528, str: "↑R3G1R1-R3", down: 6, up: 9},
    {delay: 563, str: "↑R3G1R1-R4", down: 8, up: 9},
    {delay: 598, str: "↑R3G1R1-R5", down: 10, up: 9},

    {delay: 470, str: "↑R3G1R1F-", down: 0, up: 9},
    {delay: 505, str: "↑R3G1R1F-R1", down: 2, up: 9},
    {delay: 540, str: "↑R3G1R1F-R2", down: 4, up: 9},
    {delay: 574, str: "↑R3G1R1F-R3", down: 6, up: 9}
  ]
];

var gapsList = [
  [
    {delay: 0, str: "", down: 0},

    {delay: -19, str: "G1R1", down: 3},
    {delay: -32, str: "G1R2", down: 5},
    {delay: -45, str: "G1R3", down: 7},
    {delay: -59, str: "G1R4", down: 9},
    {delay: -72, str: "G1R5", down: 11},

    {delay: -19, str: "G2R1", down: 4},
    {delay: -33, str: "G2R2", down: 6},
    {delay: -46, str: "G2R3", down: 8},
    {delay: -59, str: "G2R4", down: 10},
    {delay: -73, str: "G2R5", down: 12},

    {delay: -19, str: "G3R1", down: 5},
    {delay: -32, str: "G3R2", down: 7},
    {delay: -45, str: "G3R3", down: 9},
    {delay: -59, str: "G3R4", down: 11},

    {delay: -19, str: "G4R1", down: 6},
    {delay: -33, str: "G4R2", down: 8},
    {delay: -46, str: "G4R3", down: 10},
    {delay: -59, str: "G4R4", down: 12},

    {delay: -19, str: "G5R1", down: 7},
    {delay: -32, str: "G5R2", down: 9},
    {delay: -45, str: "G5R3", down: 11},

    {delay: -19, str: "G6R1", down: 8},
    {delay: -33, str: "G6R2", down: 10},
    {delay: -46, str: "G6R3", down: 12},

    {delay: -19, str: "G7R1", down: 9},
    {delay: -32, str: "G7R2", down: 11},
    {delay: -45, str: "G7R3", down: 13},

    {delay: -19, str: "G8R1", down: 10},
    {delay: -32, str: "G8R2", down: 12},
    {delay: -46, str: "G8R3", down: 14},

    {delay: -19, str: "G9R1", down: 11},
    {delay: -32, str: "G9R2", down: 13},
    {delay: -46, str: "G9R3", down: 15},

    {delay: -19, str: "G10R1", down: 12}
  ],
  [
    {delay: 0, str: "", down: 0},

    {delay: 47, str: "G1R1", down: 3},
    {delay: 81, str: "G1R2", down: 5},
    {delay: 116, str: "G1R3", down: 7},
    {delay: 151, str: "G1R4", down: 9},
    {delay: 185, str: "G1R5", down: 11},
    {delay: 220, str: "G1R6", down: 13},

    {delay: 52, str: "G2R1", down: 4},
    {delay: 87, str: "G2R2", down: 6},
    {delay: 122, str: "G2R3", down: 8},
    {delay: 156, str: "G2R4", down: 10},
    {delay: 191, str: "G2R5", down: 12},
    {delay: 226, str: "G2R6", down: 14},

    {delay: 55, str: "G3R1", down: 5},
    {delay: 90, str: "G3R2", down: 7},
    {delay: 125, str: "G3R3", down: 9},
    {delay: 159, str: "G3R4", down: 11},
    {delay: 194, str: "G3R5", down: 13},
    {delay: 229, str: "G3R6", down: 15},

    {delay: 59, str: "G4R1", down: 6},
    {delay: 94, str: "G4R2", down: 8},
    {delay: 129, str: "G4R3", down: 10},
    {delay: 163, str: "G4R4", down: 12},
    {delay: 198, str: "G4R5", down: 14},
    {delay: 233, str: "G4R6", down: 16},

    {delay: 61, str: "G5R1", down: 7},
    {delay: 96, str: "G5R2", down: 9},
    {delay: 130, str: "G5R3", down: 11},
    {delay: 165, str: "G5R4", down: 13},
    {delay: 200, str: "G5R5", down: 15},
    {delay: 234, str: "G5R6", down: 17},

    {delay: 60, str: "G6R1", down: 8},
    {delay: 95, str: "G6R2", down: 10},
    {delay: 129, str: "G6R3", down: 12},
    {delay: 164, str: "G6R4", down: 14},
    {delay: 199, str: "G6R5", down: 16},
    {delay: 233, str: "G6R6", down: 18},

    {delay: 60, str: "G7R1", down: 9},
    {delay: 95, str: "G7R2", down: 11},
    {delay: 130, str: "G7R3", down: 13},
    {delay: 164, str: "G7R4", down: 15},
    {delay: 199, str: "G7R5", down: 17},
    {delay: 234, str: "G7R6", down: 19},

    {delay: 63, str: "G8R1", down: 10},
    {delay: 98, str: "G8R2", down: 12},
    {delay: 132, str: "G8R3", down: 14},
    {delay: 167, str: "G8R4", down: 16},
    {delay: 202, str: "G8R5", down: 18},
    {delay: 236, str: "G8R6", down: 20},

    {delay: 64, str: "G9R1", down: 11},
    {delay: 99, str: "G9R2", down: 13},
    {delay: 134, str: "G9R3", down: 15},
    {delay: 168, str: "G9R4", down: 17},
    {delay: 203, str: "G9R5", down: 19},

    {delay: 65, str: "G10R1", down: 12},
    {delay: 99, str: "G10R2", down: 14},
    {delay: 134, str: "G10R3", down: 16},
    {delay: 169, str: "G10R4", down: 18},
    {delay: 203, str: "G10R5", down: 20},

    {delay: 65, str: "G11R1", down: 13},
    {delay: 99, str: "G11R2", down: 15},
    {delay: 134, str: "G11R3", down: 17},
    {delay: 169, str: "G11R4", down: 19},

    {delay: 65, str: "G12R1", down: 14},
    {delay: 99, str: "G12R2", down: 16},
    {delay: 134, str: "G12R3", down: 18},
    {delay: 169, str: "G12R4", down: 20}
  ]
];
