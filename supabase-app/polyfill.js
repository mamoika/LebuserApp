import { api } from './supabaseApi.js';

window.google = {
  script: {
    get run() {
      const builder = {
        successHandler: null,
        failureHandler: null,
        withSuccessHandler: function(fn) { this.successHandler = fn; return this; },
        withFailureHandler: function(fn) { this.failureHandler = fn; return this; }
      };
      
      return new Proxy(builder, {
        get(target, prop) {
          if (prop in target) return target[prop];
          return async function(...args) {
            try {
              if (api[prop]) {
                const res = await api[prop](...args);
                if (target.successHandler) target.successHandler(res);
              } else {
                console.warn('Funkcja API ' + prop + ' nie istnieje w supabaseApi.js');
                if (target.successHandler) target.successHandler(null);
              }
            } catch(err) {
              if (target.failureHandler) target.failureHandler(err);
              else console.error(err);
            }
          };
        }
      });
    }
  }
};
