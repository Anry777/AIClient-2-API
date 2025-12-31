/**
 * Configuration for thinking features in Antigravity API
 */

import * as ConfigLoader from './config-loader.js';

let cachedConfig = null;

export async function getConfig() {
    if (cachedConfig) {
        return cachedConfig;
    }

    cachedConfig = await ConfigLoader.loadConfig();
    return cachedConfig;
}

export function validateConfig(config) {
    return ConfigLoader.validateConfig(config);
}

export async function saveConfig(config, configType = 'project') {
    cachedConfig = null;
    return ConfigLoader.saveConfig(config, configType);
}

export function getDefaultConfig() {
    return ConfigLoader.DEFAULT_CONFIG;
}

export const { DEFAULT_CONFIG, loadConfig } = ConfigLoader;
