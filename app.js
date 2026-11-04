// The app now lives inside index.html. If an old copy of the page asks for this file, reload to get the new one.
location.replace(location.pathname + "?v=" + Date.now() + location.hash);
