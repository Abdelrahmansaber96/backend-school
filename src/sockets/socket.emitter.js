const { getSocketEventNames } = require('./socket.contract');

const getSocketIo = () => {
  try {
    return require('./socket.server').getIo();
  } catch (_) {
    return null;
  }
};

const emitSocketEvent = ({ room, eventName, payload, io }) => {
  const socketIo = io || getSocketIo();
  if (!socketIo || !room || !eventName) return false;

  getSocketEventNames(eventName).forEach((currentEventName) => {
    socketIo.to(room).emit(currentEventName, payload);
  });

  return true;
};

const queueSocketEvent = (options) => {
  setImmediate(() => {
    try {
      emitSocketEvent(options);
    } catch (_) { /* silent */ }
  });
};

module.exports = { emitSocketEvent, queueSocketEvent };