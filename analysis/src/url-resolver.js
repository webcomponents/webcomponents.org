const fs = require("fs");
const pathlib = require("path");
const urllib = require('url');

class UrlLoader {
  constructor(root) {
    this.root = root || '';
  }

  canLoad(url) {
    const urlObject = urllib.parse(url);
    const pathname = pathlib.normalize(decodeURIComponent(urlObject.pathname || ''));
    return this._isValid(urlObject, pathname);
  }

  _isValid(urlObject, pathname) {
      return (urlObject.protocol === 'file' || !urlObject.hostname);
  }

  load(url) {
    return new Promise((resolve, reject) => {
      const filepath = this.getFilePath(url);
      fs.readFile(filepath, 'utf8', (error, contents) => {
        if (error) {
          reject(error);
        } else {
          resolve(contents);
        }
      });
    });
  }

  getFilePath(url) {
    const urlObject = urllib.parse(url);
    const pathname = pathlib.normalize(decodeURIComponent(urlObject.pathname || ''));
    if (!this._isValid(urlObject, pathname)) {
      throw new Error(`Invalid URL ${url}`);
    }
    return this.root ? pathlib.join(this.root, pathname) : pathname;
  }

  async readDirectory(pathFromRoot, deep) {
    const files = await new Promise((resolve, reject) => {
      fs.readdir(pathlib.join(this.root, pathFromRoot), (err, files) => err ? reject(err) : resolve(files));
    });
    const results = [];
    const subDirResultPromises = [];
    for (const basename of files) {
      const file = pathlib.join(pathFromRoot, basename);
      const stat = await new Promise((resolve, reject) => fs.stat(pathlib.join(this.root, file), (err, stat) => err ? reject(err) : resolve(stat)));
      if (stat.isDirectory()) {
        if (deep) {
          subDirResultPromises.push(this.readDirectory(file, deep));
        }
      } else {
        results.push(file);
      }
    }
    const arraysOfFiles = await Promise.all(subDirResultPromises);
    for (const dirResults of arraysOfFiles) {
      for (const file of dirResults) {
        results.push(file);
      }
    }
    return results;
  }
}

module.exports = UrlLoader;