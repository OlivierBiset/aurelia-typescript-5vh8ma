import 'aurelia-polyfills';
import { initialize } from 'aurelia-pal-browser';
import { Aurelia, PLATFORM, LogManager } from 'aurelia-framework';
import { ConsoleAppender } from 'aurelia-logging-console';
import { StackBlitzLoader } from './loader';

(async () => {
  try {
    initialize();
    const aurelia = new Aurelia(new StackBlitzLoader());
    await import('./src/main').then(m => m.configure(aurelia));
  } catch (ex) {
    console.error(ex);
    document.body.textContent = ex;
  }
})();
