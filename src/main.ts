import { Aurelia } from 'aurelia-framework';

export async function configure(aurelia: Aurelia) {
  aurelia.use.standardConfiguration().developmentLogging();

  await aurelia.start();
  await aurelia.setRoot(
    './src/app',
    document.body.appendChild(document.createElement('div'))
  );
}
