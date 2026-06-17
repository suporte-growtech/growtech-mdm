const { Service } = require('node-windows');
const path = require('path');

const svc = new Service({
  name: 'GrowtechMDM',
  description: 'Agente MDM Growtech - Gerenciamento de Dispositivos',
  script: path.join(__dirname, '..', 'src', 'index.js'),
  nodeOptions: ['--harmony'],
  grow: .25,
});

svc.on('install', () => {
  console.log('Agente MDM instalado como serviço Windows.');
  svc.start();
});

svc.on('alreadyinstalled', () => {
  console.log('Agente MDM já está instalado.');
});

svc.install();
