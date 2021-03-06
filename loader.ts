import { Origin } from 'aurelia-metadata';
import { Loader, TemplateRegistryEntry, LoaderPlugin } from 'aurelia-loader';
import { DOM, PLATFORM } from 'aurelia-pal';

// ORIGINAL AUTHOR: Bazyli Brzóska https://github.com/niieani

declare const System: any;

/**
 * An implementation of the TemplateLoader interface implemented with text-based loading.
 */
export class TextTemplateLoader {
  /**
   * Loads a template.
   * @param loader The loader that is requesting the template load.
   * @param entry The TemplateRegistryEntry to load and populate with a template.
   * @return A promise which resolves when the TemplateRegistryEntry is loaded with a template.
   */
  async loadTemplate(loader, entry) {
    const text = await loader.loadText(entry.address);
    entry.template = DOM.createTemplateFromMarkup(text);
  }
}

export function ensureOriginOnExports(moduleExports, moduleId) {
  let target = moduleExports;
  let key;
  let exportedValue;

  if (target.__useDefault) {
    target = target.default;
  }

  Origin.set(target, new Origin(moduleId, 'default'));

  if (typeof target === 'object') {
    for (key in target) {
      exportedValue = target[key];

      if (typeof exportedValue === 'function') {
        Origin.set(exportedValue, new Origin(moduleId, key));
      }
    }
  }

  return moduleExports;
}

async function getModule(moduleName) {
  const hasJS = moduleName.endsWith('.js');

  try {
    return await System.import(`${moduleName}` /* webpackMode: 'eager' */);
  } catch (e) {}

  try {
    return await System.import(`./${moduleName}` /* webpackMode: 'eager' */);
  } catch (e) {}

  try {
    return await System.import(
      `${moduleName}/dist/amd/${moduleName}` /* webpackMode: 'eager' */
    );
  } catch (e) {}

  if (moduleName.includes('/')) {
    try {
      const [dep, ...path] = moduleName.split('/');
      return System.import(
        `${dep}/dist/amd/${path.join('/')}` /* webpackMode: 'eager' */
      );
    } catch (e) {}
  }

  if (!hasJS) {
    return await getModule(`${moduleName}.js`);
  }
}

/**
 * A default implementation of the Loader abstraction which works with webpack (extended common-js style).
 */
export class StackBlitzLoader extends Loader {
  moduleRegistry = Object.create(null);
  loaderPlugins = Object.create(null);
  modulesBeingLoaded = new Map();

  constructor() {
    super();
    console.log('Running aurelia-loader-sandbox...');

    this.useTemplateLoader(new TextTemplateLoader());

    this.addPlugin('template-registry-entry', {
      fetch: async moduleId => {
        const entry = this.getOrCreateTemplateRegistryEntry(moduleId);
        if (!entry.templateIsLoaded) {
          await this.templateLoader.loadTemplate(this, entry);
        }
        return entry;
      }
    });

    //     PLATFORM.eachModule = callback => {
    //       const registry = __webpack_require__.c;
    //       const cachedModuleIds = Object.getOwnPropertyNames(registry);
    //       cachedModuleIds
    //         .forEach(moduleId => {
    //           const moduleExports = registry[moduleId].exports;
    //           if (typeof moduleExports === 'object') {
    //             callback(moduleId, moduleExports);
    //           }
    //         })
    //     };
  }

  async _import(address, defaultHMR = true) {
    const addressParts = address.split('!');
    const moduleId = addressParts.splice(addressParts.length - 1, 1)[0];
    const loaderPlugin = addressParts.length === 1 ? addressParts[0] : null;

    if (loaderPlugin) {
      const plugin = this.loaderPlugins[loaderPlugin];
      if (!plugin) {
        throw new Error(
          `Plugin ${loaderPlugin} is not registered in the loader.`
        );
      }
      return await plugin.fetch(moduleId);
    }

    const m = await getModule(moduleId);
    console.debug(`Loaded '${moduleId}'`, m);
    return m;
  }

  /**
   * Maps a module id to a source.
   * @param id The module id.
   * @param source The source to map the module to.
   */
  map(id, source) {}

  /**
   * Normalizes a module id.
   * @param moduleId The module id to normalize.
   * @param relativeTo What the module id should be normalized relative to.
   * @return The normalized module id.
   */
  normalizeSync(moduleId, relativeTo) {
    return moduleId;
  }

  /**
   * Normalizes a module id.
   * @param moduleId The module id to normalize.
   * @param relativeTo What the module id should be normalized relative to.
   * @return The normalized module id.
   */
  normalize(moduleId, relativeTo) {
    return Promise.resolve(moduleId);
  }

  /**
   * Instructs the loader to use a specific TemplateLoader instance for loading templates
   * @param templateLoader The instance of TemplateLoader to use for loading templates.
   */
  useTemplateLoader(templateLoader) {
    this.templateLoader = templateLoader;
  }

  /**
   * Loads a collection of modules.
   * @param ids The set of module ids to load.
   * @return A Promise for an array of loaded modules.
   */
  loadAllModules(ids) {
    return Promise.all(ids.map(id => this.loadModule(id)));
  }

  /**
   * Loads a module.
   * @param moduleId The module ID to load.
   * @return A Promise for the loaded module.
   */
  async loadModule(moduleId, defaultHMR = true) {
    let existing = this.moduleRegistry[moduleId];
    if (existing) {
      return existing;
    }
    let beingLoaded = this.modulesBeingLoaded.get(moduleId);
    if (beingLoaded) {
      return beingLoaded;
    }
    beingLoaded = this._import(moduleId, defaultHMR);
    this.modulesBeingLoaded.set(moduleId, beingLoaded);
    const moduleExports = await beingLoaded;
    this.moduleRegistry[moduleId] = ensureOriginOnExports(
      moduleExports,
      moduleId
    );
    this.modulesBeingLoaded.delete(moduleId);
    return moduleExports;
  }

  /**
   * Loads a template.
   * @param url The url of the template to load.
   * @return A Promise for a TemplateRegistryEntry containing the template.
   */
  loadTemplate(url) {
    return this.loadModule(
      this.applyPluginToUrl(url, 'template-registry-entry'),
      false
    );
  }

  /**
   * Loads a text-based resource.
   * @param url The url of the text file to load.
   * @return A Promise for text content.
   */
  async loadText(url) {
    const result = await this.loadModule(url, false);
    if (result.default && 'string' == typeof result.default) {
      // we're dealing with a file loaded using the css-loader:
      return result.default;
    }
    return result;
  }

  /**
   * Alters a module id so that it includes a plugin loader.
   * @param url The url of the module to load.
   * @param pluginName The plugin to apply to the module id.
   * @return The plugin-based module id.
   */
  applyPluginToUrl(url, pluginName) {
    return `${pluginName}!${url}`;
  }

  /**
   * Registers a plugin with the loader.
   * @param pluginName The name of the plugin.
   * @param implementation The plugin implementation.
   */
  addPlugin(pluginName, implementation) {
    this.loaderPlugins[pluginName] = implementation;
  }
}

// PLATFORM.Loader = SandboxLoader;
// document.querySelector('body').setAttribute('aurelia-app', '');
