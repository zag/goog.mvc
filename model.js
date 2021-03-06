//     goog.mvc 0.9

//     (c) 2012 Rhys Brett-Bowen, Catch.com
//     goog.mvc may be freely distributed under the MIT license.
//     For all details and documentation:
//     https://github.com/rhysbrettbowen/goog.mvc

goog.provide('mvc.Model');
goog.provide('mvc.model.Schema');

goog.require('goog.array');
goog.require('goog.events');
goog.require('goog.events.EventTarget');
goog.require('goog.object');



/**
 * Pass an object with key value pairs for the attributes of the model
 *
 * @constructor
 * @extends {goog.events.EventTarget}
 * @param {Object=} opt_options can take in the arguments attr,
 * schema and sync.
 */
mvc.Model = function(opt_options) {
  var defaults = {
    'schema': {},
    'sync': null,
    'attr': {}
  };

  if (!opt_options)
    opt_options = {};
  opt_options['attr'] = opt_options['attr'] || {};

  goog.object.forEach(opt_options, function(val, key) {
    if (!goog.isDef(defaults[key]))
      opt_options['attr'][key] = val;
  });

  goog.object.forEach(defaults, function(val, key) {
    defaults[key] = opt_options[key] || defaults[key];
  });


  /**
     * @private
     * @type {Object.<string, ?Object>}
     */
  this.attr_ = {};
  /**
     * @private
     * @type {Object.<{attr: Array.<string>, fn: Function}>}
     */
  this.formats_ = {};
  /**
     * @private
     * @type {Object.<string, ?Object>}
     */
  this.prev_ = {};
  /**
     * @private
     * @type {Object}
     */
  this.schema_ = defaults['schema'];

  this.sync_ = defaults['sync'];

  this.bound_ = [];
  this.boundAll_ = {};
  this.onUnload_ = [];

  this.handleErr_ = goog.nullFunction;

  this.changeHandler_ = goog.events.listen(this,
      goog.events.EventType.CHANGE, this.change_, false, this);
  /**
     * @private
     * @type {string}
     */
  this.cid_ = '' + goog.getUid(this);

  this.set(defaults['attr'], true);

  this.dispatchEvent(goog.events.EventType.LOAD);
};
goog.inherits(mvc.Model, goog.events.EventTarget);


/**
 * return local id
 *
 * @return {string} the model's local ID.
 */
mvc.Model.prototype.getCid = function() {
  return this.cid_;
};


/**
 * used internally to parse strings and regexes in to functions
 *
 * @private
 * @param {*} fn schema rule to turn in to a function.
 * @return {Function} converted function.
 */
mvc.Model.prototype.parseSchemaFn_ = function(fn) {
  var val = fn;
  if (goog.isString(fn)) {
    var fns = {
      'number': goog.isNumber,
      'string': goog.isString,
      'array': goog.isArrayLike
    };
    val = function(val) {
            if (!fns[fn.toLowerCase])
        throw new Error(fn);
            return val;
    };
  }else if (val.exec) {
    val = goog.bind(function(regex, value, mod) {
            if (goog.isNull(regex.exec(value)))
        throw new Error();
            return val;}, this, fn);
  } else if (goog.isFunction(val) &&
      goog.object.getKeys(val.prototype).length) {
    val = function(val) {
            if (val.constructor == fn)
        return val;
            while (val.superClass_) {
        val = val.superClass_.constructor;
        if (val == fn)
          return val;
            }
            throw new Error();
    };
  }
  return /** @type {Function} */(val);
};


/**
 * instead of doing: model = new mvc.Model(options);
 * you can do: mvc.Model.create(options);
 *
 * @param {Object=} opt_options object to pass to mvc.Model constructor.
 * @return {mvc.Model} new model.
 */
mvc.Model.create = function(opt_options) {
  return new mvc.Model(opt_options);
};


/**
 * returns full copy of the attributes
 *
 * @return {!Object} the model as a json - this should probably be overridden.
 */
mvc.Model.prototype.toJson = function() {
  return goog.object.clone(this.attr_);
};


/**
 * sets the sync for the model
 *
 * @param {mvc.Sync} sync to set the sync for the object.
 */
mvc.Model.prototype.setSync = function(sync) {
  this.sync_ = sync;
};


/**
 * removes all attributes
 *
 * @param {boolean=} opt_silent whether to fire change event.
 */
mvc.Model.prototype.reset = function(opt_silent) {
  this.prev_ = this.attr_;
  this.attr_ = {};
  if (!opt_silent)
    this.change();
};


/**
 * gets the value for an attribute
 *
 * @param {string} key to get value of.
 * @param {*=} opt_default will return if value is undefined.
 * @return {*} the value of the key.
 */
mvc.Model.prototype.get = function(key, opt_default) {
  if (this.schema_[key] && this.schema_[key].get) {
    var get = this.schema_[key].get.apply(this, goog.array.map(
        this.schema_[key].require || [], function(requireKey) {
          if (requireKey === key) {
            return this.attr_[key];
          }
          var get = this.get(requireKey);
          return goog.isDef(get) ? get : opt_default;
        },this));
    return goog.isDef(get) ? get : opt_default;
  }
  return goog.isDef(this.attr_[key]) ? this.attr_[key] : opt_default;
};


/**
 * returns whether an ID has been set by the server
 *
 * @return {boolean} if the id hasn't been set then true.
 */
mvc.Model.prototype.isNew = function() {
  return !this.get('id');
};


/**
 * sets the schema
 *
 * @param {Object} schema to set this model's schema to.
 */
mvc.Model.prototype.setSchema = function(schema) {
  this.schema_ = schema;
};


/**
 * adds more rules to the schema
 *
 * @param {Object} schema to add rules from.
 */
mvc.Model.prototype.addSchemaRules = function(schema) {
  goog.object.extend(this.schema_, schema);
};


/**
 * @param {string} key to test existence of.
 * @return {boolean} whether key exists.
 */
mvc.Model.prototype.has = function(key) {
  return goog.object.containsKey(this.attr_, key);
};


/**
 * set either a map of key values or a key value
 *
 * @param {Object|string} key object of key value pairs to set, or the key.
 * @param {*=} opt_val to use if the key is a string, or if key is an object
 * then a boolean for silent.
 * @param {boolean=} opt_silent true if no change event should be fired.
 * @return {boolean} return if succesful.
 */
mvc.Model.prototype.set = function(key, opt_val, opt_silent) {
  var success = false;
  if (goog.isString(key)) {
    var temp = {};
    temp[key] = opt_val;
    key = temp;
  } else {
    opt_silent = /** @type {boolean} */(opt_val);
  }
  goog.object.forEach(key, function(val, key) {
    if (!this.schema_ || !goog.isDef(val)) {
      this.attr_[key] = val;
    } else {
      try {
        if (this.schema_[key] && this.schema_[key].set)
          this.attr_[key] = goog.bind(
              this.parseSchemaFn_(this.schema_[key].set), this)(val, this);
        else
          this.attr_[key] = val;
        success = true;
      } catch (err) {
        this.handleErr_(err);
      }
    }
  }, this);
  if (success) {
    if (!opt_silent) {
      this.dispatchEvent(goog.events.EventType.CHANGE);
      this.prev_ = goog.object.clone(this.attr_);
      this.attr_ = goog.object.filter(this.attr_, function(val, key) {
        return goog.isDef(val);
      });
    }
    return true;
  }
  return false;
};


/**
 * @param {string} key to remove (calls to it's get return undefined).
 * @param {boolean=} opt_silent true if no change event should be fired.
 * @return {boolean} return if succesful.
 */
mvc.Model.prototype.unset = function(key, opt_silent) {
  return this.set(key, undefined, opt_silent);
};


/**
 * fires the change event for the model
 */
mvc.Model.prototype.change = function() {
  this.dispatchEvent(goog.events.EventType.CHANGE);
};


/**
 * returns the previous value of the attribute
 *
 * @param {string} key to lookup previous value of.
 * @return {*} the previous value.
 */
mvc.Model.prototype.prev = function(key) {
  return goog.object.get(this.prev_, key, null);
};


/**
 * Can be used to create an alias, e.g:
 * model.alias('surname', 'lastName');
 *
 * @param {string} newName of the get attribute.
 * @param {string} oldName of the get attribute.
 */
mvc.Model.prototype.alias = function(newName, oldName)  {
  if (!this.schema_[newName])
    this.schema_[newName] = {};
  this.schema_[newName].get = function(oldName) {
    return oldName;
  };
  this.schema_[newName].require = [oldName];
};


/**
 * Can be used to change format returned when using get, e.g:
 * model.format('date', function(date) {return date.toDateString();});
 *
 * @param {string} attr to set the formatter for.
 * @param {Function} fn function that takes the attributes value and returns
 * the value in the format required. 'this' is set to the model.
 */
mvc.Model.prototype.format = function(attr, fn)  {
  if (!this.schema_[attr])
    this.schema_[attr] = {};
  this.schema_[attr].get = goog.bind(fn, this);
  this.schema_[attr].require = [attr];
};


/**
 * Can be used to make an attribute out of other attributes. This can be bound
 * and will fire whenever a change is made to the required attributes e.g.
 * model.meta('fullName', ['firstName', 'lastName'],
 *     function(firstName, lastName){
 *         return firstName + " " + lastName;
 *     });
 *
 * @param {string} attr that will be called by get.
 * @param {Array.<string>} require attributes needed to compute the output.
 * @param {Function} fn the function should take the value of any required
 * attributes in order. 'this' will be bound to the model.
 */
mvc.Model.prototype.meta = function(attr, require, fn) {
  if (!this.schema_[attr])
    this.schema_[attr] = {};
  this.schema_[attr].get = goog.bind(fn, this);
  this.schema_[attr].require = require;
};


/**
 * @param {string} attr the attribute to set the stter for.
 * @param {Function} fn the function to be used as a setter. The function
 * should take the new value as an argument and return the transformed value.
 * The function can also throw errors if the value doesn't validate. The
 * function will have 'this' cound to the model.
 */
mvc.Model.prototype.setter = function(attr, fn) {
  this.schema_[attr] = this.schema_[attr] || {};
  this.schema_[attr].set = goog.bind(fn, this);
};


/**
 * returns object of changed attributes and their values
 *
 * @return {Array.<string>} array of the key names that have changed. Used
 * internally to decide which attributes to fire change functions for.
 */
mvc.Model.prototype.getChanges = function() {
  var schema = this.schema_;
  var getReq = function(key, req) {
    if (schema[key] && schema[key].require) {
      goog.array.extend(req, schema[key].require);
      for (var i = 0; i < schema[key].require.length; i++) {
        if (schema[key].require[i] !== key)
          getReq(schema[key].require[i], req);
      }
    }
  };

  var ret = goog.object.getKeys(goog.object.filter(this.schema_,
      function(val, key) {
        var requires = [];
        getReq(key, requires);
        return goog.array.some(requires, function(require) {
          return this.attr_[require] !== this.prev_[require];
        }, this);
      }, this));
  goog.array.extend(ret, goog.object.getKeys(goog.object.filter(this.attr_,
      function(val, key) {
        return val !== this.prev_[key];
      }, this)));
  return ret;
};


/**
 * reverts an object's values to it's last fetch
 *
 * @param {boolean=} opt_silent whether to fire change event.
 * @return {mvc.Model} with it's attributes reverted to previous change.
 */
mvc.Model.prototype.revert = function(opt_silent) {
  var newAttr = {};
  goog.object.extend(newAttr, goog.object.map(this.prev_, function(val) {
    return {val: val, prev: null};
  }));
  goog.object.forEach(this.attr_, function(val, key) {
    if (key in newAttr) {
      newAttr[key].prev = val;
    }
  });
  if (!opt_silent)
    this.dispatchEvent(goog.events.EventType.CHANGE);
  return this;
};


/**
 * @param {boolean=} opt_sync pass true to del the sync to delete the model.
 */
mvc.Model.prototype.dispose = function(opt_sync) {
  if (opt_sync)
    this.sync_.del(this);
  this.dispatchEvent(goog.events.EventType.UNLOAD);
  goog.array.forEach(this.onUnload_, function(fn) {
    fn(this);
  }, this);
  this.disposeInternal();
};


/**
 * reads an object fomr an external source using sync
 *
 * @param {function(Object, number, mvc.Model)=} opt_callback will be called
 * when fetch is complete.
 */
mvc.Model.prototype.fetch = function(opt_callback) {
  this.sync_.read(this, opt_callback);
};


/**
 * pushes the object to the sync
 */
mvc.Model.prototype.save = function() {
  if (this.sync_)
    if (this.isNew())
      this.sync_.create(this);
    else
      this.sync_.update(this);
};


/**
 * can use this to construct setters. For instance if you would set a value
 * like:
 *   model.set('location:latitude', number);
 * you can make a convenience method like this:
 * model.lat = model.getBinder('location:latitude');
 * and then you only need to use:
 *   model.lat(number); // to set
 *   var lat = model.lat(); // to get
 *
 * @param {string} key to create binder for.
 * @return {Function} a function that will take a value to set
 * or nothing to get the key's value.
 */
mvc.Model.prototype.getBinder = function(key) {
  return goog.bind(function(val) {
    if (goog.isDef(val)) {
      this.set(key, val);
    } else {
      return this.get(key);
    }
  }, this);
};


/**
 * function called when a change is detected on the object. Call the model's
 * .change() function to fire manually
 *
 * @private
 */
mvc.Model.prototype.change_ = function() {
  var changes = this.getChanges();
  goog.array.forEach(this.bound_, function(val) {
    if (goog.array.some(val.attr, function(attr) {
      return goog.array.contains(changes, attr);
    })) {
      val.fn.apply(val.hn, goog.array.concat(goog.array.map(val.attr,
          function(attr) {
            return this.get(attr);
          },this)));
    }
  }, this);
  goog.object.forEach(this.boundAll_, function(val) {
    val(this);
  }, this);
};


/**
 * @param {Function} fn function to run when model is disposed.
 * @param {Object=} opt_handler object for 'this' of function.
 * @return {number} id to use for unbind.
 */
mvc.Model.prototype.bindUnload = function(fn, opt_handler) {
  fn = goog.bind(fn, (opt_handler || this));
  var uid = goog.getUid(fn);
  this.onUnload_.push(fn);
  return uid;
};


/**
 * Allows easy binding of a model's attribute to an element or a function.
 * bind('name', function(value), handler) allows you to run a function and
 * optionally bind it to the handler. You can also pass in an array of names
 * to listen for a change on any of the attributes.
 *
 * @param {Array|string} name of attributes to listen to.
 * @param {Function} fn function to run when change.
 * @param {*=} opt_handler object for 'this' of function.
 * @return {number} id to use for unbind.
 */
mvc.Model.prototype.bind = function(name, fn, opt_handler) {
  if (goog.isString(name))
    name = [name];
  var bind = {
    attr: name,
    fn: fn,
    hn: (opt_handler || this)
  };
  bind.cid = goog.getUid(bind);
  this.bound_.push(bind);
  return bind.cid;
};


/**
 * unbind a listener by id
 *
 * @param {number} id returned form bind or bindall.
 * @return {boolean} if found and removed.
 */
mvc.Model.prototype.unbind = function(id) {
  return goog.array.removeIf(this.bound_, function(bound) {
    return (bound.id == id);
  }) || goog.object.remove(this.boundAll_, id) ||
      goog.array.removeIf(this.onUnload_, function(fn) {
        return goog.getUid(fn) == id;
      });
};


/**
 * bind to any change event
 *
 * @param {Function} fn function to bind.
 * @param {Object=} opt_handler object to bind 'this' to.
 * @return {number} id to use for unbind.
 */
mvc.Model.prototype.bindAll = function(fn, opt_handler) {
  var bound = goog.bind(fn, (opt_handler || this));
  var id = goog.getUid(bound);
  goog.object.set(this.boundAll_, '' + id, bound);
  return id;
};


