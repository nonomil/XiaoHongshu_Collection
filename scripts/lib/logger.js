function logInfo(message, ...rest) {
  console.log(message, ...rest);
}

function logWarn(message, ...rest) {
  console.warn(message, ...rest);
}

function logError(message, ...rest) {
  console.error(message, ...rest);
}

module.exports = {
  logInfo,
  logWarn,
  logError
};
