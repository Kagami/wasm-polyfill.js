
//
// Various misc helper functions.
//

import Long from "long"
import { CompileError, RuntimeError } from "./errors"
import { TYPES } from "./constants"
import stdlib from "./stdlib"

export function trap(msg) {
  throw new RuntimeError(msg || "it's a trap!")
}

export function assertIsDefined(obj) {
  if (typeof obj === "undefined") {
    throw new TypeError()
  }
}

export function assertIsInstance(obj, Cls) {
  if (!(obj instanceof Cls)) {
    throw new TypeError()
  }
}

export function assertIsType(obj, typstr) {
  if (typeof obj !== typstr) {
    throw new TypeError()
  }
}

export function assertIsCallable(obj) {
  // XXX TODO: more complicated cases
  if (typeof obj !== "function" ) {
    throw new TypeError()
  }
}

export function ToWASMValue(jsValue, typ) {
  if (typeof jsValue === "undefined") {
    return 0
  }
  if (typeof jsValue !== 'number' && ! (jsValue instanceof Number)) {
    throw new TypeError("cant pass non-number in to WASM")
  }
  switch (typ) {
    case TYPES.I32:
      return jsValue|0
    case TYPES.I64:
      return Long.fromNumber(jsValue)
    case TYPES.F32:
      return stdlib.ToF32(jsValue)
    case TYPES.F64:
      return +jsValue
    default:
      throw new TypeError("Unknown type: " + typ)
  }
}

export function ToJSValue(wasmValue, typ) {
  switch (typ) {
    case TYPES.I32:
    case TYPES.F32:
    case TYPES.F64:
      return wasmValue
    case TYPES.I64:
      // XXX TODO: precise semantics here?
      // I think we're supposed to return an error...
      return wasmValue.toNumber()
    default:
      throw new TypeError("unknown WASM type: " + typ)
  }
}

export function ToNonWrappingUint32(v) {
  // XXX TODO: throw RangeError if > UINT32_MAX
  return v >>> 0
}

var scratchBuf = new ArrayBuffer(8)
var scratchBytes = new Uint8Array(scratchBuf)
var scratchData = new DataView(scratchBuf)

export function renderJSValue(v, constants) {
  // We need to preserve two things that don't round-trip through v.toString():
  //  * the distinction between -0 and 0
  //  * the precise bit-pattern of an NaN
  if (typeof v === "number" || (typeof v === "object" && v instanceof Number)) {
    if (isNaN(v)) {
      // XXX TODO: re-work this to just pass it in as a constant
      scratchData.setFloat64(0, v, true)
      return "WebAssembly._fromNaNBytes([" + scratchBytes.join(",") + "]," + (!!v._signalling) + ")"
    }
    return "" + (((v < 0 || 1 / v < 0) ? "-" : "") + Math.abs(v))
  }
  // Special rendering required for Long instances.
  if (v instanceof Long) {
    return "new Long(" + v.low + "," + v.high + ")"
  }
  // Quote simple strings directly, but place more complex ones
  // as constants so that we don't have to try to escape them.
  if (typeof v === 'string') {
    if (/^[A-Za-z0-9_ $-]*$/.test(v)) {
      return "'" + v + "'"
    }
    constants.push(v)
    return "constants[" + (constants.length - 1) + "]"
  }
  // Everything else just renders as a string.
  throw new CompileError('rendering unknown type of value: ' + (typeof v) + " : " + v)
  return v
}

export function _fromNaNBytes(bytes, isSignalling) {
  for (var i = 0; i < 8; i++) {
    scratchBytes[i] = bytes[i]
  }
  var v = scratchData.getFloat64(0, true)
  if (isSignalling) {
    v = new Number(v)
    v._signalling = true
  }
  return v
}

export function makeSigStr(funcSig) {
   var typeCodes = []
   function typeCode(typ) {
     switch (typ) {
       case TYPES.I32:
         return "i"
       case TYPES.I64:
         return "l"
       case TYPES.F32:
         return "f"
       case TYPES.F64:
         return "d"
       default:
         throw new CompileError("unexpected type: " + typ)
     }
   }
   funcSig.param_types.forEach(function(typ) {
     typeCodes.push(typeCode(typ))
   })
   typeCodes.push("_")
   funcSig.return_types.forEach(function(typ) {
     typeCodes.push(typeCode(typ))
   })
   return typeCodes.join("")
}

export function dump() {
  if (typeof process === "undefined" || ! process.stderr) {
    return console.log.apply(console, arguments)
  }
  for (var i = 0; i < arguments.length; i++) {
    var arg = arguments[i]
    if (typeof arg === 'string') {
      process.stderr.write(arg)
    } else if (typeof arg === 'number' || (arg instanceof Number)) {
      process.stderr.write(renderJSValue(arg))
    } else {
      process.stderr.write(JSON.stringify(arg))
    }
    process.stderr.write(' ')
  }
  process.stderr.write('\n')
}

var _filename = undefined;

export function filename() {

  if (_filename) {
    return _filename
  }

  var errlines = new Error().stack.split('\n');
  for (var i = 0; i < errlines.length; i++) {
    var match = /(at .+ \(|at |@)(.+\/.+\.js):/.exec(errlines[i])
    if (match) {
      _filename = match[2]
      return _filename
    }
  }

  throw new RuntimeError("could not determine script filename")
}
