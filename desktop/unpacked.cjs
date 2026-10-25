// In the packaged app, files live inside app.asar, which Electron can read but Python cannot.
// The Python helpers are kept outside it (package.json build.asarUnpack): start them from there.
const unpacked = path => String(path).replace(/app\.asar([\/])/, 'app.asar.unpacked$1');
module.exports = { unpacked };
