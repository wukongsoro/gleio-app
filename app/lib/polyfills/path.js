// Custom path polyfill for browser compatibility
// This replaces path-browserify to avoid the "module is not defined" error

const path = {
  resolve: (...args) => {
    return args.join('/').replace(/\/+/g, '/').replace(/^\//, '');
  },

  join: (...args) => {
    return args.join('/').replace(/\/+/g, '/');
  },

  dirname: (p) => {
    const parts = p.split('/');
    parts.pop();
    return parts.join('/') || '.';
  },

  basename: (p, ext) => {
    const base = p.split('/').pop() || '';
    if (ext && base.endsWith(ext)) {
      return base.slice(0, -ext.length);
    }
    return base;
  },

  extname: (p) => {
    const base = path.basename(p);
    const lastDot = base.lastIndexOf('.');
    return lastDot > 0 ? base.slice(lastDot) : '';
  },

  sep: '/',
  delimiter: ':',

  posix: {
    resolve: (...args) => {
      return args.join('/').replace(/\/+/g, '/').replace(/^\//, '');
    },

    join: (...args) => {
      return args.join('/').replace(/\/+/g, '/');
    },

    dirname: (p) => {
      const parts = p.split('/');
      parts.pop();
      return parts.join('/') || '.';
    },

    basename: (p, ext) => {
      const base = p.split('/').pop() || '';
      if (ext && base.endsWith(ext)) {
        return base.slice(0, -ext.length);
      }
      return base;
    },

    extname: (p) => {
      const base = path.basename(p);
      const lastDot = base.lastIndexOf('.');
      return lastDot > 0 ? base.slice(lastDot) : '';
    },

    relative: (from, to) => {
      const fromParts = from.split('/').filter(p => p);
      const toParts = to.split('/').filter(p => p);

      // Find common prefix
      let i = 0;
      while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) {
        i++;
      }

      // Build relative path
      const upLevels = fromParts.length - i;
      const downLevels = toParts.slice(i);

      const result = [];
      for (let j = 0; j < upLevels; j++) {
        result.push('..');
      }
      result.push(...downLevels);

      return result.join('/') || '.';
    },

    sep: '/',
    delimiter: ':',
  },
};

// Export for both CommonJS and ES modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = path;
}

if (typeof exports !== 'undefined') {
  exports.default = path;
}

export default path;
