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
};

// Export for both CommonJS and ES modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = path;
}

if (typeof exports !== 'undefined') {
  exports.default = path;
}

export default path;
