const log = require('../lib/logger').logger.getLogger('Server');
const path = require('path');
const fs   = require('fs');

let config = {};
const SECRETS_DIR =  process.env.SECRETS_DIR || '/run/secrets';
const secrets = {};

if (fs.existsSync(SECRETS_DIR)) {
  const files = fs.readdirSync(SECRETS_DIR);
  // eslint-disable-next-line no-unused-vars
  files.forEach(function(file, index) {
    const fullPath = path.join(SECRETS_DIR, file);
    const key = file;
    try {
        const data = fs.readFileSync(fullPath, 'utf8').toString().trim();
        secrets[key] = data;
    } catch (e) {
        log.error(e.message);
    }
  });
}

/**
 * If an ENV is a protected Docker Secret extract the value of the secret data
 */
function get_secret_data(key) {
  const filepath = process.env[key + '_FILE'];
  if (filepath) {
    process.env[key] = secrets[path.parse(filepath).base] || process.env[key];
  }
}

function to_boolean(env, default_value) {
  return env !== undefined ? env.toLowerCase() === 'true' : default_value;
}

function to_array(env, default_value) {
  return env !== undefined ? env.split(',') : default_value;
}

/**
 * Looks for environment variables that could override configuration values.
 */
function process_environment_variables(verbose) {
  const environment_variables = [
    'PEP_PROXY_PORT',
    'PEP_PROXY_HTTPS_ENABLED',
    'PEP_PROXY_HTTPS_PORT',
    'PEP_PROXY_IDM_HOST',
    'PEP_PROXY_IDM_PORT',
    'PEP_PROXY_IDM_SSL_ENABLED',
    'PEP_PROXY_APP_HOST',
    'PEP_PROXY_APP_PORT',
    'PEP_PROXY_APP_SSL_ENABLED',
    'PEP_PROXY_ORG_ENABLED',
    'PEP_PROXY_ORG_HEADER',
    'PEP_PROXY_APP_ID',
    'PEP_PROXY_USERNAME',
    'PEP_PROXY_PASSWORD',
    'PEP_TOKEN_SECRET',
    'PEP_PROXY_AUTH_ENABLED',
    'PEP_PROXY_PDP',
    'PEP_PROXY_AZF_PROTOCOL',
    'PEP_PROXY_AZF_HOST',
    'PEP_PROXY_AZF_PORT',
    'PEP_PROXY_AZF_CUSTOM_POLICY',
    'PEP_PROXY_PUBLIC_PATHS',
    'PEP_PROXY_CORS_ORIGIN',
    'PEP_PROXY_CORS_METHODS',
    'PEP_PROXY_CORS_OPTIONS_SUCCESS_STATUS',
    'PEP_PROXY_CORS_ALLOWED_HEADERS',
    'PEP_PROXY_CORS_CREDENTIALS',
    'PEP_PROXY_CORS_MAX_AGE',
    'PEP_PROXY_AUTH_FOR_NGINX',
    'PEP_PROXY_MAGIC_KEY',
  ];

  const protected_variables = [
    'PEP_PROXY_USERNAME',
    'PEP_PROXY_PASSWORD',
    'PEP_TOKEN_SECRET',
  ];

  // Substitute Docker Secret Variables where set.
  protected_variables.forEach(key => {
    get_secret_data(key);
  });

  if (verbose) {
    environment_variables.forEach(key => {
      let value = process.env[key];
      if (value) {
        if (
          key.endsWith('USERNAME') ||
          key.endsWith('PASSWORD') ||
          key.endsWith('SECRET') ||
          key.endsWith('KEY')
        ) {
          value = '********';
        }
        log.debug('Setting %s to environment value: %s', key, value);
      }
    });
  }

  // Used only if https is disabled
  if (process.env.PEP_PROXY_PORT) {
    config.pep_port = process.env.PEP_PROXY_PORT;
  }

  config.https = config.https || {
    cert_file: 'cert/cert.crt',
    key_file: 'cert/key.key',
    port: 443,
  };

  if (process.env.PEP_PROXY_HTTPS_ENABLED) {
    config.https.enabled = to_boolean(
      process.env.PEP_PROXY_HTTPS_ENABLED,
      false
    );
  }
  if (process.env.PEP_PROXY_HTTPS_PORT) {
    config.pep_port = process.env.PEP_PROXY_HTTPS_PORT;
  }

  config.idm = config.idm || {};
  if (process.env.PEP_PROXY_IDM_HOST) {
    config.idm.host = process.env.PEP_PROXY_IDM_HOST;
  }
  if (process.env.PEP_PROXY_IDM_PORT) {
    config.idm.port = process.env.PEP_PROXY_IDM_PORT;
  }
  if (process.env.PEP_PROXY_IDM_SSL_ENABLED) {
    config.idm.ssl = to_boolean(process.env.PEP_PROXY_IDM_SSL_ENABLED, false);
  }

  config.app = config.app || {};

  if (process.env.PEP_PROXY_APP_HOST) {
    config.app.host = process.env.PEP_PROXY_APP_HOST;
  }
  if (process.env.PEP_PROXY_APP_PORT) {
    config.app.port = process.env.PEP_PROXY_APP_PORT;
  }
  if (process.env.PEP_PROXY_APP_SSL_ENABLED) {
    config.app.ssl = to_boolean(process.env.PEP_PROXY_APP_SSL_ENABLED, false);
  }

  config.organizations = config.organizations || {};
  if (process.env.PEP_PROXY_ORG_ENABLED) {
    config.organizations.enabled = to_boolean(
      process.env.PEP_PROXY_ORG_ENABLED,
      false
    );
  }
  if (process.env.PEP_PROXY_ORG_HEADER) {
    config.organizations.header = process.env.PEP_PROXY_ORG_HEADER;
  }

  config.pep = config.pep || {};

  if (process.env.PEP_PROXY_APP_ID) {
    config.pep.app_id = process.env.PEP_PROXY_APP_ID;
  }
  if (process.env.PEP_PROXY_USERNAME) {
    config.pep.username = process.env.PEP_PROXY_USERNAME;
  }
  if (process.env.PEP_PROXY_PASSWORD) {
    config.pep.password = process.env.PEP_PROXY_PASSWORD;
  }

  config.pep.token = config.pep.token || {};
  if (process.env.PEP_TOKEN_SECRET) {
    config.pep.token.secret = process.env.PEP_TOKEN_SECRET;
  }

  // if enabled PEP checks permissions in two ways:
  //  - With IdM: only allow basic authorization
  //  - With Authzforce: allow basic and advanced authorization.
  //    For advanced authorization, you can use custom policy checks by including programatic scripts
  //    in policies folder. An script template is included there
  //
  //  This is only compatible with oauth2 tokens engine

  config.authorization = config.authorization || { pdp: 'idm' };
  if (process.env.PEP_PROXY_AUTH_ENABLED) {
    config.authorization.enabled = to_boolean(
      process.env.PEP_PROXY_AUTH_ENABLED,
      false
    );
  }
  if (process.env.PEP_PROXY_PDP) {
    config.authorization.pdp = process.env.PEP_PROXY_PDP;
  }
  config.authorization.azf = config.authorization.azf || {};
  if (process.env.PEP_PROXY_AZF_PROTOCOL) {
    config.authorization.azf.protocol = process.env.PEP_PROXY_AZF_PROTOCOL;
  }
  if (process.env.PEP_PROXY_AZF_HOST) {
    config.authorization.azf.host = process.env.PEP_PROXY_AZF_HOST;
  }
  if (process.env.PEP_PROXY_AZF_PORT) {
    config.authorization.azf.port = process.env.PEP_PROXY_AZF_PORT;
  }
  if (process.env.PEP_PROXY_AZF_CUSTOM_POLICY) {
    config.authorization.azf.custom_policy =
      process.env.PEP_PROXY_AZF_CUSTOM_POLICY;
  }

  if (process.env.PEP_PROXY_PUBLIC_PATHS) {
    config.public_paths = to_array(process.env.PEP_PROXY_PUBLIC_PATHS, []);
  }

  // Ensure reasonable defaults if cors not stated.
  config.cors = config.cors || {};
  const cors  = config.cors;
  cors.origin = cors.origin || true;
  cors.methods = cors.methods || "GET,HEAD,PUT,PATCH,POST,DELETE";
  cors.optionsSuccessStatus = cors.optionsSuccessStatus || 204;
  cors.credentials =  cors.credentials || true;

  if (process.env.PEP_PROXY_CORS_ORIGIN) {
    cors.origin = to_array(process.env.PEP_PROXY_CORS_ORIGIN, ["*"]);
  }
  if (process.env.PEP_PROXY_CORS_METHODS) {
    cors.methods = process.env.PEP_PROXY_CORS_METHODS;
  }
  if (process.env.PEP_PROXY_CORS_OPTIONS_SUCCESS_STATUS) {
    cors.optionsSuccessStatus = process.env.PEP_PROXY_CORS_OPTIONS_SUCCESS_STATUS;
  }
  if (process.env.PEP_PROXY_CORS_ALLOWED_HEADERS) {
    cors.allowedHeaders = process.env.PEP_PROXY_CORS_ALLOWED_HEADERS;
  }
  if (process.env.PEP_PROXY_CORS_CREDENTIALS) {
    cors.credentials =  to_boolean(process.env.PEP_PROXY_CORS_CREDENTIALS, true);
  }
  if (process.env.PEP_PROXY_MAX_AGE) {
    cors.maxAge = process.env.PEP_PROXY_MAX_AGE;
  }

  if (process.env.PEP_PROXY_AUTH_FOR_NGINX) {
    config.auth_for_nginx = to_boolean(
      process.env.PEP_PROXY_AUTH_FOR_NGINX,
      false
    );
  }

  if (process.env.PEP_PROXY_MAGIC_KEY) {
    config.magic_key = process.env.PEP_PROXY_MAGIC_KEY;
  }
}

function set_config(new_config, verbose = false) {
  config = new_config;
  process_environment_variables(verbose);
}

function get_config() {
  return config;
}

module.exports = {
  get_config,
  set_config,
};
