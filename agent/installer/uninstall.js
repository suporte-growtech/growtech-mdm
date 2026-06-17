const { Service } = require('node-windows');
const path = require('path');

const svc = new Service({
  name: 'GrowtechMDM',
  script: path.join(__dirname, '..', 'src', 'index.js'),
});

svc.on('uninstall', () => {
  console.log('Agente MDM removido.');
});

svc.uninstall();
