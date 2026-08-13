(() => {
  'use strict';

  const originalFetch = window.fetch.bind(window);

  function fieldValue(properties, fieldName) {
    if (!properties) return undefined;
    if (Object.prototype.hasOwnProperty.call(properties, fieldName)) return properties[fieldName];
    const target = fieldName.toLowerCase();
    const key = Object.keys(properties).find(name => {
      const lower = name.toLowerCase();
      return lower === target || lower.endsWith(`.${target}`) || lower.endsWith(`_${target}`);
    });
    return key === undefined ? undefined : properties[key];
  }

  function normalizeFields(raw) {
    for (const feature of raw?.features || []) {
      const properties = feature.properties || (feature.properties = {});
      const city = fieldValue(properties, 'NAME20');
      const geoid = fieldValue(properties, 'GEOID10');
      if (city !== undefined && properties.NAME20 === undefined) properties.NAME20 = city;
      if (geoid !== undefined && properties.GEOID10 === undefined) properties.GEOID10 = geoid;
    }
    return raw;
  }

  window.fetch = async function patchedFetch(input, init) {
    const response = await originalFetch(input, init);
    const url = typeof input === 'string' ? input : (input?.url || '');
    if (!url.includes('sa_cities_tract10.geojson') || !response.ok) return response;

    return new Proxy(response, {
      get(target, prop) {
        if (prop === 'json') return async () => normalizeFields(await target.json());
        const value = Reflect.get(target, prop, target);
        return typeof value === 'function' ? value.bind(target) : value;
      }
    });
  };
})();
