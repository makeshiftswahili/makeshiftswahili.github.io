(() => {
  'use strict';

  const originalFetch = window.fetch.bind(window);

  function aliasFields(data) {
    if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) return data;

    for (const feature of data.features) {
      const p = feature && feature.properties;
      if (!p || typeof p !== 'object') continue;
      const keys = Object.keys(p);

      if (p.NAME20 == null) {
        const nameKey = keys.find(k => k.endsWith('.NAME20'));
        if (nameKey) p.NAME20 = p[nameKey];
      }

      if (p.GEOID10 == null) {
        const tractKey = keys.find(k => k.endsWith('main__us_tract10_GEOID10'))
          || keys.find(k => k.endsWith('.GEOID10'));
        if (tractKey) p.GEOID10 = p[tractKey];
      }
    }
    return data;
  }

  window.fetch = async function patchedFetch(input, init) {
    const response = await originalFetch(input, init);
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (!url.includes('sa_cities_tract10.geojson')) return response;

    const originalJson = response.json.bind(response);
    Object.defineProperty(response, 'json', {
      configurable: true,
      value: async () => aliasFields(await originalJson())
    });
    return response;
  };
})();
