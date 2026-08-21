const { contextBridge } = require("electron");

const desktopIdentity = Object.freeze({
  isDesktop: true,
  platform: process.platform
});

contextBridge.exposeInMainWorld("teachHelperDesktop", desktopIdentity);
