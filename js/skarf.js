/**
 * skarf.js
 * Generic JavaScript augmented reality (AR) framework for handling different JavaScript AR libraries in Three.js
 *
 * Copyright (C) 2013 Skeel Lee (http://cg.skeelogy.com)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see [http://www.gnu.org/licenses/].
 */

/**
 * @fileOverview Generic JavaScript augmented reality (AR) framework for handling different JavaScript AR libraries in Three.js
 * @author Skeel Lee <skeel@skeelogy.com>
 * @version 1.0.1
 *
 * @example
 *
 * //create a Skarf instance which uses JSARToolKit (as an example)
 * var source = document.getElementById('myVideo');
 * var canvasContainerElem = document.getElementById('canvasContainer');
 * var camFov = 40.0;  //this must be the same value used in the Three.js render cam too
 * var skarf = new SKARF.Skarf({
 *
 *     arLibType: 'jsartoolkit',
 *     trackingElem: source,
 *     markerSize: 1,
 *     verticalFov: camFov,  //you can leave this out because JSARToolKit default projection matrix seems to work better for generic web cams
 *     threshold: 128,
 *     debug: options.displayDebugView,
 *
 *     canvasContainerElem: canvasContainerElem,
 *
 *     renderer: renderer,
 *     scene: scene,
 *     camera: camera,
 *
 *     markersJsonFile: 'models/models_jsartoolkit.json'
 *
 * });
 *
 * //update on every frame
 * skarf.update(dt);
 */

/**
 * @namespace
 */
var SKARF = SKARF || { version: '1.0.1' };
console.log('Using SKARF ' + SKARF.version);

//===================================
// GUI MARKERS
//===================================

/**
 * Factory that creates GuiMarkers
 * @namespace
 */
SKARF.GuiMarkerFactory = {

    mappings: {},

    /**
     * Function to create a SKARF.GuiMarker instance
     * @param {string} type Type of GuiMarker to create: 'generic', 'button', 'checkbox', 'slider', 'combobox', 'timer'
     * @param {object} options Options
     * @param {string} options.key Unique string ID that identifies this GUI marker. This name is used to search for callback functions related to this GUI marker.
     * @param {string} options.name Name for this GUI marker
     * @param {number} options.markerId ID of the AR marker
     * @param {THREE.Object3D} options.markerTransform A transform to hold this GUI marker
     * @param {number} options.markerSize Scale of the GUI marker
     * @param {object} options.params Additional parameters to customize this GUI marker
     */
    create: function (type, options) {
        if (!type) {
            throw new Error('SKARF.GuiMarker type not specified');
        }
        if (!this.mappings.hasOwnProperty(type)) {
            throw new Error('SKARF.GuiMarker of this type has not been registered with SKARF.GuiMarkerFactory: ' + type);
        }
        var guiMarker = new this.mappings[type](options);
        return guiMarker;
    },

    /**
     * Registers a type string to a class
     * @param {string} mappingName Name of the mapping which is used to identify the type when creating instances e.g. 'threejs'
     * @param {SKARF.GuiMarker} mappingClass GuiMarker class that will be created when the associated type is used
     */
    register: function (mappingName, mappingClass) {
        if (this.mappings.hasOwnProperty(mappingName)) {
            throw new Error('Mapping name already exists: ' + mappingName);
        }
        this.mappings[mappingName] = mappingClass;
    }
};

/**
 * An augmented reality GUI marker.<br/>
 * @constructor
 * @abstract
 */
SKARF.GuiMarker = function (options) {

    if (typeof options.key === 'undefined') {
        throw new Error('key not specified');
    }
    this.__key = options.key;
    if (typeof options.name === 'undefined') {
        throw new Error('name not specified');
    }
    this.__name = options.name;
    if (typeof options.markerId === 'undefined') {
        throw new Error('markerId not specified');
    }
    this.__markerId = options.markerId;
    if (typeof options.markerTransform === 'undefined') {
        throw new Error('markerTransform not specified');
    }
    this.__markerTransform = options.markerTransform;
    //TODO: determine if markerSize is needed
    if (typeof options.markerSize === 'undefined') {
        throw new Error('markerSize not specified');
    }
    this.__markerSize = options.markerSize;

    this.__firstDetected = true;
    this.__firstHidden = false;

    this.__worldMatrix = null;

    //variables for position
    this.__position = new THREE.Vector3();
    this.__prevPosition = new THREE.Vector3();
    this.__dPosition = new THREE.Vector3();
    this.__moveThresholdLow = 0.02;  //to ignore slight flickerings
    this.__moveThresholdHigh = 0.5;  //in case axes flip and a large change occurs

    //variables for rotation
    this.__worldZAxis = new THREE.Vector3(0, 0, 1);
    this.__worldYAxis = new THREE.Vector3(0, 1, 0);
    this.__currZAxis = new THREE.Vector3();
    this.__rotation = 0;
    this.__prevRotation = 0;
    this.__dRotation = 0;
    this.__rotThresholdLow = 1.0;  //to ignore slight flickerings
    this.__rotThresholdHigh = 10.0;  //in case axes flip and a large change occurs

    //callback objects
    this.__callbackObjs = {};
    this.__callbackObjs['moved'] = {name: this.__key + '_moved', fn: undefined};
    this.__callbackObjs['rotated'] = {name: this.__key + '_rotated', fn: undefined};
    this.__callbackObjs['firstDetected'] = {name: this.__key + '_firstDetected', fn: undefined};
    this.__callbackObjs['firstHidden'] = {name: this.__key + '_firstHidden', fn: undefined};
    this.__callbackObjs['detected'] = {name: this.__key + '_detected', fn: undefined};
    this.__callbackObjs['hidden'] = {name: this.__key + '_hidden', fn: undefined};
};
/**
 * Call this method when the GUI marker is detected
 * @param {number} dt Time elapsed since previous frame
 * @param {THREE.Matrix4} worldMatrix World matrix for the marker
 */
SKARF.GuiMarker.prototype.detected = function (dt, worldMatrix) {

    //store world matrix first
    this.__worldMatrix = worldMatrix;

    //get position and rotation
    this.__processPosition(worldMatrix);
    this.__processRotation(worldMatrix);

    //process callbacks
    this.__processCallbacks();

    //turn off firstDetected
    this.__firstDetected = false;

    //turn on first hidden, for the next hide
    this.__firstHidden = true;
};
SKARF.GuiMarker.prototype.__processPosition = function (worldMatrix) {

    this.__position.getPositionFromMatrix(worldMatrix);

    //check if marker has moved
    this.__dPosition.copy(this.__position.clone().sub(this.__prevPosition));
    var movedDist = this.__dPosition.length();
    if (movedDist >= this.__moveThresholdLow && movedDist <= this.__moveThresholdHigh) {
        //call the moved callback
        this.__invokeCallback('moved', {guiMarker: this, position: this.__position, dPosition: this.__dPosition});
    }

    //store the previous position
    this.__prevPosition.copy(this.__position);
};
SKARF.GuiMarker.prototype.__processRotation = function (worldMatrix) {

    //NOTE: tried to extract the Euler Y rotation and then take the difference but can't seem to get it to work.
    //So I'm finding the angle between local Z and world Z manually

    //get the current X axis
    this.__currZAxis.getColumnFromMatrix(2, worldMatrix).normalize();

    //find the current angle (against world Z)
    this.__rotation = THREE.Math.radToDeg(Math.acos(this.__currZAxis.dot(this.__worldZAxis)));

    //check cross product against world Y
    var orthoAxis = new THREE.Vector3().crossVectors(this.__currZAxis, this.__worldZAxis);
    var orthoAngle = orthoAxis.dot(this.__worldYAxis);
    if (orthoAngle < 0) {  //opposite side
        this.__rotation = 360 - this.__rotation;
    }

    this.__dRotation = this.__rotation - this.__prevRotation;
    var absDRot = Math.abs(this.__dRotation);
    if (!isNaN(this.__dRotation) && absDRot >= this.__rotThresholdLow && absDRot <= this.__rotThresholdHigh) {
        this.__invokeCallback('rotated', {guiMarker: this, rotation: this.__rotation, dRotation: this.__dRotation});
    }

    //store prev rotation
    this.__prevRotation = this.__rotation;
};
SKARF.GuiMarker.prototype.__processCallbacks = function () {

    //call detected callback
    this.__invokeCallback('detected', {guiMarker: this, worldMatrix: this.__worldMatrix, position: this.__position, rotation: this.__rotation});

    //call firstDetected callback
    if (this.__firstDetected) {
        this.__invokeCallback('firstDetected', {guiMarker: this, worldMatrix: this.__worldMatrix, position: this.__position, rotation: this.__rotation});
    }
};
/**
 * Call this method when the marker has been hidden
 */
SKARF.GuiMarker.prototype.hidden = function () {

    //turn on firstDetected, for the next detection
    this.__firstDetected = true;

    //call firstHidden callback
    if (this.__firstHidden) {
        this.__invokeCallback('firstHidden', {guiMarker: this});
        this.__firstHidden = false;
    }

    //call hidden callback
    this.__invokeCallback('hidden', {guiMarker: this});
};
SKARF.GuiMarker.prototype.__invokeCallback = function (type, options) {

    var callbackObj = this.__callbackObjs[type];

    //if callback function has not been eval'ed, do it first
    if (typeof callbackObj.fn === 'undefined') {
        try {
            callbackObj.fn = eval(callbackObj.name);
        } catch (err) {
            callbackObj.fn = null;
        }
    }

    //call the callback function if it exists
    if (callbackObj.fn) {
        callbackObj.fn.call(this, options);
    }
};

/**
 * Generic SKARF.GuiMarker<br/>
 * <strong>Please do not instantiate this class on your own. Use the {@linkcode SKARF.GuiMarkerFactory GuiMarkerFactory} instead.</strong>
 * @constructor
 * @extends {SKARF.GuiMarker}
 */
SKARF.GenericMarker = function (options) {
    SKARF.GuiMarker.call(this, options);
};
//inherit
SKARF.GenericMarker.prototype = Object.create(SKARF.GuiMarker.prototype);
SKARF.GenericMarker.prototype.constructor = SKARF.GenericMarker;
//register with factory
SKARF.GuiMarkerFactory.register('generic', SKARF.GenericMarker);

/**
 * SKARF.GuiMarker that activates once until the marker is next shown<br/>
 * <strong>Please do not instantiate this class on your own. Use the {@linkcode SKARF.GuiMarkerFactory GuiMarkerFactory} instead.</strong>
 * @constructor
 * @extends {SKARF.GuiMarker}
 */
SKARF.ButtonMarker = function (options) {
    SKARF.GuiMarker.call(this, options);
    this.__callbackObjs['clicked'] = {name: this.__key + '_clicked', fn: undefined};
};
//inherit
SKARF.ButtonMarker.prototype = Object.create(SKARF.GuiMarker.prototype);
SKARF.ButtonMarker.prototype.constructor = SKARF.ButtonMarker;
//register with factory
SKARF.GuiMarkerFactory.register('button', SKARF.ButtonMarker);
//override
SKARF.ButtonMarker.prototype.__processCallbacks = function () {
    if (this.__firstDetected) {
        this.__invokeCallback('clicked', {guiMarker: this});
    }
    SKARF.GuiMarker.prototype.__processCallbacks.call(this);
};

/**
 * SKARF.GuiMarker that toggles an on/off state once until the marker is next shown<br/>
 * <strong>Please do not instantiate this class on your own. Use the {@linkcode SKARF.GuiMarkerFactory GuiMarkerFactory} instead.</strong>
 * @constructor
 * @extends {SKARF.GuiMarker}
 */
SKARF.CheckBoxMarker = function (options) {
    SKARF.GuiMarker.call(this, options);
    this.__callbackObjs['toggled'] = {name: this.__key + '_toggled', fn: undefined};
    this.checked = false;
};
//inherit
SKARF.CheckBoxMarker.prototype = Object.create(SKARF.GuiMarker.prototype);
SKARF.CheckBoxMarker.prototype.constructor = SKARF.CheckBoxMarker;
//register with factory
SKARF.GuiMarkerFactory.register('checkbox', SKARF.CheckBoxMarker);
//override
SKARF.CheckBoxMarker.prototype.__processCallbacks = function () {
    if (this.__firstDetected) {
        this.checked = !this.checked;
        this.__invokeCallback('toggled', {guiMarker: this, checked: this.checked});
    }
    SKARF.GuiMarker.prototype.__processCallbacks.call(this);
};

/**
 * SKARF.GuiMarker that emulates an attribute-changing slider by rotating<br/>
 * <strong>Please do not instantiate this class on your own. Use the {@linkcode SKARF.GuiMarkerFactory GuiMarkerFactory} instead.</strong>
 * @constructor
 * @extends {SKARF.GuiMarker}
 */
SKARF.SliderMarker = function (options) {
    SKARF.GuiMarker.call(this, options);
    this.speed = options.params && options.params.speed ? options.params.speed : 1.0;
    this.__callbackObjs['changed'] = {name: this.__key + '_changed', fn: undefined};
};
//inherit
SKARF.SliderMarker.prototype = Object.create(SKARF.GuiMarker.prototype);
SKARF.SliderMarker.prototype.constructor = SKARF.SliderMarker;
//register with factory
SKARF.GuiMarkerFactory.register('slider', SKARF.SliderMarker);
//override
SKARF.SliderMarker.prototype.__processCallbacks = function () {
    var absDRot = Math.abs(this.__dRotation);
    if (!isNaN(this.__dRotation) && absDRot >= this.__rotThresholdLow && absDRot <= this.__rotThresholdHigh) {
        this.__invokeCallback('changed', {guiMarker: this, delta: this.__dRotation * this.speed});
    }
    SKARF.GuiMarker.prototype.__processCallbacks.call(this);
};

/**
 * SKARF.GuiMarker that emulates a combo box. Selection is based on orientation of marker.<br/>
 * <strong>Please do not instantiate this class on your own. Use the {@linkcode SKARF.GuiMarkerFactory GuiMarkerFactory} instead.</strong>
 * @constructor
 * @extends {SKARF.GuiMarker}
 */
SKARF.ComboBoxMarker = function (options) {
    SKARF.GuiMarker.call(this, options);
    this.__callbackObjs['changed'] = {name: this.__key + '_changed', fn: undefined};
    if (!(options.params && options.params.numChoices)) {
        throw new Error('numChoices not specified as a parameter');
    }
    this.numChoices = options.params.numChoices;
    this.currId = 0;
};
//inherit
SKARF.ComboBoxMarker.prototype = Object.create(SKARF.GuiMarker.prototype);
SKARF.ComboBoxMarker.prototype.constructor = SKARF.ComboBoxMarker;
//register with factory
SKARF.GuiMarkerFactory.register('combobox', SKARF.ComboBoxMarker);
//override
SKARF.ComboBoxMarker.prototype.__processCallbacks = function () {
    var newId = Math.floor(this.__rotation / 360.0 * this.numChoices);
    if (newId !== this.currId) {
        this.__invokeCallback('changed', {guiMarker: this, selectedId: newId, rotation: this.__rotation});
        this.currId = newId;
    }
    SKARF.GuiMarker.prototype.__processCallbacks.call(this);
};

/**
 * SKARF.GuiMarker that activates after a certain amount of time<br/>
 * <strong>Please do not instantiate this class on your own. Use the {@linkcode SKARF.GuiMarkerFactory GuiMarkerFactory} instead.</strong>
 * @constructor
 * @extends {SKARF.GuiMarker}
 */
SKARF.TimerMarker = function (options) {
    SKARF.GuiMarker.call(this, options);
    this.__callbackObjs['reached'] = {name: this.__key + '_reached', fn: undefined};
    this.time = (options.params && options.params.time) || 2.0;
    this.currTime = 0;
    this.reached = false;
};
//inherit
SKARF.TimerMarker.prototype = Object.create(SKARF.GuiMarker.prototype);
SKARF.TimerMarker.prototype.constructor = SKARF.TimerMarker;
//register with factory
SKARF.GuiMarkerFactory.register('timer', SKARF.TimerMarker);
//override
SKARF.TimerMarker.prototype.detected = function (dt, worldMatrix) {
    SKARF.GuiMarker.prototype.detected.call(this, dt, worldMatrix);
    this.currTime += dt;
    if (!this.reached && this.currTime >= this.time) {
        this.reached = true;
        this.__invokeCallback('reached', {guiMarker: this});
    }
};
SKARF.TimerMarker.prototype.hidden = function () {

    //reset if marker disappears
    this.currTime = 0;
    this.reached = false;

    SKARF.GuiMarker.prototype.hidden.call(this);
};
SKARF.TimerMarker.prototype.resetTimer = function () {
    this.currTime = 0;
};

//===================================
// MODEL LOADERS
//===================================

/**
 * Factory which creates ModelLoaders
 * @namespace
 */
SKARF.ModelLoaderFactory = {

    mappings: {},

    /**
     * Function to create a SKARF.ModelLoader instance
     * @param {string} type Type of ModelLoader to create: 'empty', 'json', 'json_bin', 'obj'
     */
    create: function (type) {
        if (!type) {
            throw new Error('Model type not specified');
        }
        if (!this.mappings.hasOwnProperty(type)) {
            throw new Error('SKARF.ModelLoader of this type has not been registered with SKARF.ModelLoaderFactory: ' + type);
        }
        var loader = new this.mappings[type]();
        return loader;
    },

    /**
     * Registers a type string to a class
     * @param {string} mappingName Name of the mapping which is used to identify the type when creating instances e.g. 'threejs'
     * @param {SKARF.ModelLoader} mappingClass ModelLoader class that will be created when the associated type is used
     */
    register: function (mappingName, mappingClass) {
        if (this.mappings.hasOwnProperty(mappingName)) {
            throw new Error('Mapping name already exists: ' + mappingName);
        }
        this.mappings[mappingName] = mappingClass;
    }
};

/**
 * Abstract class for model loaders
 * @constructor
 * @abstract
 */
SKARF.ModelLoader = function () {
    this.loader = null;
};
/**
 * Loads model for marker
 * @abstract
 * @param  {object}  model Data containing the model info (from JSON file)
 * @param  {number}  markerId ID of marker to laod
 * @param  {THREE.Object3D}  markerTransform Transform to parent to after model has loaded
 * @param  {number}  overallScale Overall scale
 * @param  {boolean} isWireframeVisible Whether to initialize the wireframe mode to true
 * @param  {SKARF.MarkerManager} markerManager Instance of MarkerManager
 */
SKARF.ModelLoader.prototype.loadForMarker = function (model, markerId, markerTransform, overallScale, isWireframeVisible, markerManager) {
    throw new Error('Abstract method not implemented');
};
/**
 * Transforms and parents a model onto a transform
 * @param {object} model Data containing the model info (from JSON file)
 * @param {THREE.Mesh} object Mesh to parent
 * @param {THREE.Object3D} markerTransform Transform to parent to
 * @param {number} overallScale Overall scale
 * @param {SKARF.MarkerManager} markerManager Instance of MarkerManager
 */
SKARF.ModelLoader.prototype.transformAndParent = function (model, object, markerTransform, overallScale, markerManager) {

    if (object) {

        object.traverse(function (object) {
            if (object instanceof THREE.Mesh) {

                //store the model data into the geometry
                object.geometry.__jsonData = model;

                //accumulate transformations into matrix
                var m = new THREE.Matrix4();
                if (model.translate) {
                    m.setPosition(new THREE.Vector3(model.translate[0], model.translate[1], model.translate[2]));
                }
                if (model.rotate) {
                    var rotationMat = new THREE.Matrix4();
                    var rotationVector = new THREE.Vector3(THREE.Math.degToRad(model.rotate[0]), THREE.Math.degToRad(model.rotate[1]), THREE.Math.degToRad(model.rotate[2]));
                    var rotationOrder = model.rotationOrder || 'XYZ';
                    rotationMat.makeRotationFromEuler(rotationVector, model.rotationOrder);
                    m.multiply(rotationMat);
                }
                if (model.scale) {
                    m.scale(new THREE.Vector3(model.scale[0] * overallScale, model.scale[1] * overallScale, model.scale[2] * overallScale));
                }

                //bake transforms into geometry
                object.geometry.applyMatrix(m);
                markerTransform.add(object);

                //store the material in markerManager
                markerManager.materials.push(object.material);

                //compute bounding box
                object.geometry.computeBoundingBox();

                //also set objects to cast shadows
                object.castShadow = true;
                object.receiveShadow = true;
            }
        });

    }
};

/**
 * Model loader which contains no models<br/>
 * <strong>Please do not instantiate this class on your own. Use the {@linkcode SKARF.ModelLoaderFactory ModelLoaderFactory} instead.</strong>
 * @constructor
 * @extends {SKARF.ModelLoader}
 */
SKARF.EmptyModelLoader = function () {
    SKARF.ModelLoader.call(this);
    this.loader = new THREE.JSONLoader();
    console.log('Created a SKARF.EmptyModelLoader');
};
//inherit from SKARF.ModelLoader
SKARF.EmptyModelLoader.prototype = Object.create(SKARF.ModelLoader.prototype);
SKARF.EmptyModelLoader.prototype.constructor = SKARF.EmptyModelLoader;
//register with factory
SKARF.ModelLoaderFactory.register('empty', SKARF.EmptyModelLoader);
//override methods
/**
 * Loads model for marker
 * @param  {object}  model Data containing the model info (from JSON file)
 * @param  {number}  markerId ID of marker to laod
 * @param  {THREE.Object3D}  markerTransform Transform to parent to after model has loaded
 * @param  {number}  overallScale Overall scale
 * @param  {boolean} isWireframeVisible Whether to initialize the wireframe mode to true
 * @param  {SKARF.MarkerManager} markerManager Instance of MarkerManager
 */
SKARF.EmptyModelLoader.prototype.loadForMarker = function (model, markerId, markerTransform, overallScale, isWireframeVisible, markerManager) {
    //TODO: time how long it takes to load

    //bake transformations into vertices
    this.transformAndParent(model, null, markerTransform, overallScale, markerManager);

    console.log('Loaded empty transform for marker id ' + markerId);
};

/**
 * Model loader which contains Three.js JSON model data
 * <strong>Please do not instantiate this class on your own. Use the {@linkcode SKARF.ModelLoaderFactory ModelLoaderFactory} instead.</strong>
 * @constructor
 * @extends {SKARF.ModelLoader}
 */
SKARF.JsonModelLoader = function () {
    SKARF.ModelLoader.call(this);
    this.loader = new THREE.JSONLoader();
    console.log('Created a SKARF.JsonModelLoader');
};
//inherit from SKARF.ModelLoader
SKARF.JsonModelLoader.prototype = Object.create(SKARF.ModelLoader.prototype);
SKARF.JsonModelLoader.prototype.constructor = SKARF.JsonModelLoader;
//register with factory
SKARF.ModelLoaderFactory.register('json', SKARF.JsonModelLoader);
//override methods
/**
 * Loads model for marker
 * @param  {object}  model Data containing the model info (from JSON file)
 * @param  {number}  markerId ID of marker to laod
 * @param  {THREE.Object3D}  markerTransform Transform to parent to after model has loaded
 * @param  {number}  overallScale Overall scale
 * @param  {boolean} isWireframeVisible Whether to initialize the wireframe mode to true
 * @param  {SKARF.MarkerManager} markerManager Instance of MarkerManager
 */
SKARF.JsonModelLoader.prototype.loadForMarker = function (model, markerId, markerTransform, overallScale, isWireframeVisible, markerManager) {
    //TODO: time how long it takes to load

    var that = this;
    this.loader.load(model.url, function (geometry, materials) {

        //set wireframe visibility
        var i, len;
        for (i = 0, len = materials.length; i < len; i++) {
            materials[i].wireframe = isWireframeVisible;
        }

        //create mesh
        var mesh = new THREE.Mesh(geometry, new THREE.MeshFaceMaterial(materials));

        //bake transformations into vertices
        that.transformAndParent(model, mesh, markerTransform, overallScale, markerManager);

        console.log('Loaded mesh ' + model.url + ' for marker id ' + markerId);
    });
};

/**
 * Model loader which contains Three.js JSON binary models
 * <strong>Please do not instantiate this class on your own. Use the {@linkcode SKARF.ModelLoaderFactory ModelLoaderFactory} instead.</strong>
 * @constructor
 * @extends {SKARF.ModelLoader}
 */
SKARF.JsonBinaryModelLoader = function () {
    SKARF.ModelLoader.call(this);
    if (typeof THREE.BinaryLoader === 'undefined') {
        throw new Error('THREE.BinaryLoader does not exist. Have you included BinaryLoader.js?');
    }
    this.loader = new THREE.BinaryLoader();
    console.log('Created a SKARF.JsonBinaryModelLoader');
};
//inherit from SKARF.JsonModelLoader
SKARF.JsonBinaryModelLoader.prototype = Object.create(SKARF.JsonModelLoader.prototype);
SKARF.JsonBinaryModelLoader.prototype.constructor = SKARF.JsonBinaryModelLoader;
//register with factory
SKARF.ModelLoaderFactory.register('json_bin', SKARF.JsonBinaryModelLoader);

/**
 * Model loader which contains OBJ models
 * <strong>Please do not instantiate this class on your own. Use the {@linkcode SKARF.ModelLoaderFactory ModelLoaderFactory} instead.</strong>
 * @constructor
 * @extends {SKARF.ModelLoader}
 */
SKARF.ObjModelLoader = function () {

    SKARF.ModelLoader.call(this);

    if (typeof THREE.OBJMTLLoader === 'undefined') {
        throw new Error('THREE.OBJMTLLoader does not exist. Have you included OBJMTLLoader.js and MTLLoader.js?');
    }
    this.loader = new THREE.OBJMTLLoader();
    console.log('Created a SKARF.ObjModelLoader');

    //register an event listener
    var that = this;
    this.loader.addEventListener('load', function (event) {

        var object = event.content;  //this ia a THREE.Object3D

        //set wireframe visibility
        var child, grandChild;
        var i, j, leni, lenj;
        for (i = 0, leni = object.children.length; i < leni; i++) {
            child = object.children[i];
            for (j = 0, lenj = child.children.length; j < lenj; j++) {
                grandChild = child.children[j];
                if (grandChild instanceof THREE.Mesh) {
                    grandChild.material.wireframe = that.isWireframeVisible;
                }
            }
        }

        //transform and parent
        that.transformAndParent(that.model, object, that.markerTransform, that.overallScale, that.markerManager);

        console.log('Loaded mesh ' + that.model.url + ' for marker id ' + that.markerId);
    });
};
//inherit from SKARF.ModelLoader
SKARF.ObjModelLoader.prototype = Object.create(SKARF.ModelLoader.prototype);
SKARF.ObjModelLoader.prototype.constructor = SKARF.ObjModelLoader;
//register with factory
SKARF.ModelLoaderFactory.register('obj', SKARF.ObjModelLoader);
//override methods
/**
 * Loads model for marker
 * @param  {object}  model Data containing the model info (from JSON file)
 * @param  {number}  markerId ID of marker to laod
 * @param  {THREE.Object3D}  markerTransform Transform to parent to after model has loaded
 * @param  {number}  overallScale Overall scale
 * @param  {boolean} isWireframeVisible Whether to initialize the wireframe mode to true
 * @param  {SKARF.MarkerManager} markerManager Instance of MarkerManager
 */
SKARF.ObjModelLoader.prototype.loadForMarker = function (model, markerId, markerTransform, overallScale, isWireframeVisible, markerManager) {

    //store variables in the instance since there seems to be no way to pass to loader.load (TODO: verify this)
    this.model = model;
    this.markerId = markerId;
    this.markerTransform = markerTransform;
    this.overallScale = overallScale;
    this.isWireframeVisible = isWireframeVisible;
    this.markerManager = markerManager;

    //call load()
    var mtlFile = model.url.replace(/\.obj/g, '.mtl');  //assume mtl file has same base name as .obj
    this.loader.load(model.url, mtlFile);
};

//===================================
// MARKER MANAGER
//===================================

/**
 * Manager to manage markers, both for models and GuiMarkers
 * @constructor
 */
SKARF.MarkerManager = function (markersJsonFile) {
    this.markersJsonFile = markersJsonFile;

    this.markerData = null;
    this.modelLoaders = {};

    this.materials = [];

    this.__load();
};
SKARF.MarkerManager.prototype.__load = function () {
    console.log('Loading markers json file: ' + this.markersJsonFile);

    //load the JSON file
    var that = this;
    $.ajax({
        url: this.markersJsonFile,
        async: false
    }).done(function (data) {
        that.markerData = data;
        console.log('Loaded ' + that.markersJsonFile);
        console.log('Main marker id: ' + that.markerData.mainMarkerId);
    }).error(function (xhr, textStatus, error) {
        throw new Error('error loading ' + this.markersJsonFile + ': ' + error);
    });
};
/**
 * Loads model for marker
 * @param  {number}  markerId ID of marker to load
 * @param  {THREE.Object3D}  markerTransform Transform to parent to after model has loaded
 * @param  {number}  markerSize Size of marker
 * @param  {boolean} isWireframeVisible Whether to initialize the wireframe mode to true
 */
SKARF.MarkerManager.prototype.loadForMarker = function (markerId, markerTransform, markerSize, isWireframeVisible) {

    markerSize = markerSize || 1.0;

    //two types of markers to load:

    if (this.markerData.models && this.markerData.models[markerId]) {
        //1) models
        var model = this.markerData.models[markerId];
        if (model) {
            var type = model.type;
            if (!this.modelLoaders.hasOwnProperty(type)) {
                //create a loader using SKARF.ModelLoaderFactory
                this.modelLoaders[type] = SKARF.ModelLoaderFactory.create(type);
            }
            this.modelLoaders[type].loadForMarker(model, markerId, markerTransform, markerSize, isWireframeVisible, this);
        }
    } else if (this.markerData.guiMarkers && this.markerData.guiMarkers[markerId]) {
        //2) GUI markers
        var guiMarker = this.markerData.guiMarkers[markerId];
        if (guiMarker) {
            var type = guiMarker.type;
            guiMarker = SKARF.GuiMarkerFactory.create(type, {
                name: guiMarker.name,
                key: guiMarker.key,
                markerId: markerId,
                markerTransform: markerTransform,
                markerSize: markerSize,
                params: guiMarker.params
            });
            markerTransform.guiMarker = guiMarker;
        }
    } else {
        console.warn('Unable to find data for marker id ' + markerId);
    }

};

//===================================
// HELPERS
//===================================

// I'm going to use a glMatrix-style matrix as an intermediary.
// So the first step is to create a function to convert a glMatrix matrix into a Three.js Matrix4.
THREE.Matrix4.prototype.setFromArray = function (m) {
    return this.set(
        m[0], m[4], m[8], m[12],
        m[1], m[5], m[9], m[13],
        m[2], m[6], m[10], m[14],
        m[3], m[7], m[11], m[15]
    );
};

function copyMarkerMatrix(arMat, glMat) {
    glMat[0] = arMat.m00;
    glMat[1] = -arMat.m10;
    glMat[2] = arMat.m20;
    glMat[3] = 0;
    glMat[4] = arMat.m01;
    glMat[5] = -arMat.m11;
    glMat[6] = arMat.m21;
    glMat[7] = 0;
    glMat[8] = -arMat.m02;
    glMat[9] = arMat.m12;
    glMat[10] = -arMat.m22;
    glMat[11] = 0;
    glMat[12] = arMat.m03;
    glMat[13] = -arMat.m13;
    glMat[14] = arMat.m23;
    glMat[15] = 1;
}

//===================================
// AR LIBRARIES
//===================================

/**
 * Factory which creates SKARF.ArLibs<br/>
 * <strong>NOTE: This is meant for internal usage only as the created instance needs some manual variable assignments and initializations before they are usable. These are done internally by a {@linkcode SKARF.Skarf Skarf} instance.</strong>
 * @namespace
 */
SKARF.ArLibFactory = {

    mappings: {},

    /**
     * Function to create a SKARF.ArLib instance
     * @param {string} type Type of ArLib to create: 'jsartoolkit', 'jsaruco'
     * @param {object} options Options
     * @param {canvas} options.trackingElem Canvas DOM element used for tracking
     * @param {number} options.markerSize Size of marker in mm, determines scale of scene
     * @param {number} options.mainMarkerId ID of main marker
     * @param {number} [options.verticalFov] Vertical field-of-view of web cam (you will have to estimate this). If this is not defined, it will use use some default field-of-view which works in general for web cams.
     * @param {number} [options.threshold=128] Threshold value for turning tracking stream into a binary image. Ranges from 0 to 255. Used only for JSARToolKit.
     * @param {boolean} [options.debug=false] Whether to turn on debug view/mode
     */
    create: function (type, options) {
        if (!type) {
            throw new Error('SKARF.ArLib type not specified');
        }
        if (!this.mappings.hasOwnProperty(type)) {
            throw new Error('SKARF.ArLib of this type has not been registered with SKARF.ArLibFactory: ' + type);
        }
        var arLib = new this.mappings[type](options);
        return arLib;
    },

    /**
     * Registers a type string to a class
     * @param {string} mappingName Name of the mapping which is used to identify the type when creating instances e.g. 'jsartoolkit'
     * @param {SKARF.ArLib} mappingClass ArLib class that will be created when the associated type is used
     */
    register: function (mappingName, mappingClass) {
        if (this.mappings.hasOwnProperty(mappingName)) {
            throw new Error('Mapping name already exists: ' + mappingName);
        }
        this.mappings[mappingName] = mappingClass;
    }
};

/**
 * Abstract class for ArLibs
 * @constructor
 * @abstract
 */
SKARF.ArLib = function (options) {

    if (typeof options.trackingElem === 'undefined') {
        throw new Error('trackingElem not specified');
    }
    this.trackingElem = options.trackingElem;

    if (typeof options.markerSize === 'undefined') {
        throw new Error('markerSize not specified');
    }
    this.markerSize = options.markerSize;

    this.verticalFov = options.verticalFov;

    if (typeof options.mainMarkerId === 'undefined') {
        throw new Error('mainMarkerId not specified');
    }
    this.mainMarkerId = options.mainMarkerId;

    this.debug = (typeof options.debug === 'undefined') ? false : options.debug;

    this.compensationMatrix = new THREE.Matrix4();

    this.mainMarkerHasEverBeenDetected = false;

    //temp matrix for calculations later
    this.tmpMat = new THREE.Matrix4();

    //variables to be assigned by skarf
    this.canvasElem = null;
    this.renderer = null;

    this.markers = {};  //this is just to keep track if a certain marker id has been seen
};
/**
 * Initializes the instance
 * @abstract
 */
SKARF.ArLib.prototype.init = function () {
    throw new Error('Abstract method not implemented');
};
/**
 * Updates the instance
 * @abstract
 * @param  {number} dt Time elapsed since previous frame
 */
SKARF.ArLib.prototype.update = function (dt) {
    throw new Error('Abstract method not implemented');
};

/**
 * ArLib class for JSARToolKit.<br/>
 * <strong>Please do not instantiate this class on your own. Use the {@linkcode SKARF.ArLibFactory ArLibFactory} instead.</strong>
 * @constructor
 * @extends {SKARF.ArLib}
 */
SKARF.JsArToolKitArLib = function (options) {
    SKARF.ArLib.call(this, options);

    this.threshold = options.threshold || 128;

    this.compensationMatrix = new THREE.Matrix4().makeScale(1, 1, -1);  //scale in -z to swap from LH-coord to RH-coord
    this.compensationMatrix.multiply(new THREE.Matrix4().makeRotationX(THREE.Math.degToRad(90)));  //rotate 90deg in X to get Y-up;

    //store some temp variables
    this.resultMat = new NyARTransMatResult();
    this.tmp = {};
};
//inherit from SKARF.ArLib
SKARF.JsArToolKitArLib.prototype = Object.create(SKARF.ArLib.prototype);
SKARF.JsArToolKitArLib.prototype.constructor = SKARF.JsArToolKitArLib;
//register with factory
SKARF.ArLibFactory.register('jsartoolkit', SKARF.JsArToolKitArLib);
//override methods
/**
 * Initializes the instance
 */
SKARF.JsArToolKitArLib.prototype.init = function () {
    //required by JSARToolKit to show the debug canvas
    DEBUG = this.debug;

    // Create a RGB raster object for the 2D canvas.
    // JSARToolKit uses raster objects to read image data.
    // Note that you need to set canvas.changed = true on every frame.
    this.raster = new NyARRgbRaster_Canvas2D(this.canvasElem);

    // FLARParam is the thing used by FLARToolKit to set camera parameters.
    this.flarParam = new FLARParam(this.canvasElem.width, this.canvasElem.height, this.verticalFov);

    // The FLARMultiIdMarkerDetector is the actual detection engine for marker detection.
    // It detects multiple ID markers. ID markers are special markers that encode a number.
    this.detector = new FLARMultiIdMarkerDetector(this.flarParam, this.markerSize);

    // For tracking video set continue mode to true. In continue mode, the detector
    // tracks markers across multiple frames.
    this.detector.setContinueMode(true);

    //set the camera projection matrix in the renderer
    this.initCameraProjMatrix();
};
/**
 * Initializes the camera projection matrix.
 * This is called automatically during initialization. Call this function only if you need to re-initialize the camera projection matrix again.
 */
SKARF.JsArToolKitArLib.prototype.initCameraProjMatrix = function () {
    var camProjMatrixArray = new Float32Array(16);
    this.flarParam.copyCameraMatrix(camProjMatrixArray, 0.1, 10000);
    this.renderer.initCameraProjMatrix(camProjMatrixArray);
};
/**
 * Updates the instance
 * @param  {number} dt Elapsed time since previous frame
 */
SKARF.JsArToolKitArLib.prototype.update = function (dt) {

    DEBUG = this.debug;

    //set all markers detected to false first
    var keys = Object.keys(this.markers);
    var i, j;
    for (i = 0; i < keys.length; i++) {
        this.renderer.__setMarkerDetected(keys[i], false);
    }

    // Do marker detection by using the detector object on the raster object.
    // The threshold parameter determines the threshold value
    // for turning the video frame into a 1-bit black-and-white image.
    //
    //NOTE: THE CANVAS MUST BE THE SAME SIZE AS THE RASTER
    //OTHERWISE WILL GET AN "Uncaught #<Object>" ERROR
    var markerCount = this.detector.detectMarkerLite(this.raster, this.threshold);

    // Go through the detected markers and get their IDs and transformation matrices.
    var id, currId;
    for (i = 0; i < markerCount; i++) {

        // Get the ID marker data for the current marker.
        // ID markers are special kind of markers that encode a number.
        // The bytes for the number are in the ID marker data.
        id = this.detector.getIdMarkerData(i);

        // Read bytes from the id packet.
        currId = -1;
        // This code handles only 32-bit numbers or shorter.
        if (id.packetLength <= 4) {
            currId = 0;
            for (j = 0; j < id.packetLength; j++) {
                currId = (currId << 8) | id.getPacketData(j);
            }
        }

        // If this is a new id, let's start tracking it.
        if (typeof this.markers[currId] === 'undefined') {

            //create empty object for the marker
            this.markers[currId] = {};

            //create a transform for this marker
            var transform = this.renderer.__createTransformForMarker(currId, this.markerSize);

            //delay-load the model
            this.renderer.loadForMarker(currId, transform, this.markerSize);

            //if this is the main marker id, turn on flag
            if (currId == this.mainMarkerId) {  //double equals for auto type conversion
                this.mainMarkerHasEverBeenDetected = true;
            }
        }

        try {
            // Get the transformation matrix for the detected marker.
            this.detector.getTransformMatrix(i, this.resultMat);

            // Copy the marker matrix to the tmp matrix.
            copyMarkerMatrix(this.resultMat, this.tmp);

            //store the current solved matrix first
            this.tmpMat.setFromArray(this.tmp);
            this.renderer.__setCurrSolvedMatrixValues(currId, this.tmpMat);

            //register that this marker has been detected
            this.renderer.__setMarkerDetected(currId, true);
        } catch (err) {
            //just print to console but let the error pass so that the program can continue
            console.log(err.message);
        }
    }

    //update the solved scene
    this.renderer.__updateSolvedScene(dt, this.mainMarkerId);
};

/**
 * ArLib class for js-aruco.<br/>
 * <strong>Please do not instantiate this class on your own. Use the {@linkcode SKARF.ArLibFactory ArLibFactory} instead.</strong>
 * @constructor
 * @extends {SKARF.ArLib}
 */
SKARF.JsArucoArLib = function (options) {
    SKARF.ArLib.call(this, options);
};
//inherit from SKARF.ArLib
SKARF.JsArucoArLib.prototype = Object.create(SKARF.ArLib.prototype);
SKARF.JsArucoArLib.prototype.constructor = SKARF.JsArucoArLib;
//register with factory
SKARF.ArLibFactory.register('jsaruco', SKARF.JsArucoArLib);
//override methods
/**
 * Initializes the instance
 */
SKARF.JsArucoArLib.prototype.init = function () {
    this.detector = new AR.Detector();

    //NOTE: the second parameter is suppose to be canvasWidth (from the js-aruco example).
    //However, it cannot work when I change the aspect ratio of the tracking canvas.
    //It seems as though the tracking canvas must be 4:3, so I'm doing some compensation here to allow any aspect ratio.
    this.posit = new POS.Posit(this.markerSize, this.canvasElem.height * 4.0 / 3.0);

    this.context = this.canvasElem.getContext('2d');
};
/**
 * Updates the instance
 * @param  {number} dt Elapsed time since previous frame
 */
SKARF.JsArucoArLib.prototype.update = function (dt) {
    var imageData = this.context.getImageData(0, 0, this.canvasElem.width, this.canvasElem.height);
    var markers = this.detector.detect(imageData);
    if (this.debug) {
        this.__drawCorners(markers);
        this.__drawId(markers);
    }

    //update scene
    this.__updateScenes(dt, markers);
};
SKARF.JsArucoArLib.prototype.__updateScenes = function (dt, markers) {
    var corners, corner, pose, markerId;

    //set all markers detected to false first
    var keys = Object.keys(this.markers);
    var i, j;
    for (i = 0; i < keys.length; i++) {
        this.renderer.__setMarkerDetected(keys[i], false);
    }

    for (i = 0; i < markers.length; i++) {
        markerId = markers[i].id;
        corners = markers[i].corners;

        // If this is a new id, let's start tracking it.
        if (typeof this.markers[markerId] === 'undefined') {

            console.log('Creating new marker root for id ' + markerId);

            //create empty object for the marker
            this.markers[markerId] = {};

            //create a transform for this marker
            var transform = this.renderer.__createTransformForMarker(markerId, this.markerSize);

            //delay-load the model
            this.renderer.loadForMarker(markerId, transform, this.markerSize);

            //if this is the main marker id, turn on flag
            if (markerId == this.mainMarkerId) {  //double equals for auto type conversion
                this.mainMarkerHasEverBeenDetected = true;
            }
        }

        //align corners to center of canvas
        for (j = 0; j < corners.length; j++) {
            corner = corners[j];
            //NOTE: there seems to be some scale away from the center, so I have to scale everything down from the center.
            //The value of 0.97 is by trial-and-error, seems to work pretty well.
            corner.x = 0.97 * (corner.x - (this.canvasElem.width / 2));
            corner.y = 0.97 * ((this.canvasElem.height / 2) - corner.y);
        }

        //estimate pose
        try {
            pose = this.posit.pose(corners);

            //store the current solved matrix first
            this.__updateMatrix4FromRotAndTrans(pose.bestRotation, pose.bestTranslation);
            this.tmpMat.multiply(new THREE.Matrix4().makeRotationX(THREE.Math.degToRad(90)));
            this.renderer.__setCurrSolvedMatrixValues(markerId, this.tmpMat);

            //register that this marker has been detected
            this.renderer.__setMarkerDetected(markerId, true);

        } catch (err) {
            //just print to console but let the error pass so that the program can continue
            console.log(err.message);
        }
    }

    //update the solved scene
    this.renderer.__updateSolvedScene(dt, this.mainMarkerId);
};
SKARF.JsArucoArLib.prototype.__updateMatrix4FromRotAndTrans = function (rotationMat, translationVec) {
    this.tmpMat.set(
        rotationMat[0][0], rotationMat[0][1], -rotationMat[0][2], translationVec[0],
        rotationMat[1][0], rotationMat[1][1], -rotationMat[1][2], translationVec[1],
        -rotationMat[2][0], -rotationMat[2][1], rotationMat[2][2], -translationVec[2],
        0, 0, 0, 1);
};
SKARF.JsArucoArLib.prototype.__drawCorners = function (markers) {

    var corners, corner, i, j, leni, lenj;
    for (i = 0, leni = markers.length; i < leni; i++) {
        corners = markers[i].corners;

        this.context.lineWidth = 2;
        this.context.strokeStyle = "red";
        this.context.beginPath();

        for (j = 0, lenj = corners.length; j < lenj; j++) {
            corner = corners[j];
            this.context.moveTo(corner.x, corner.y);
            corner = corners[(j + 1) % corners.length];
            this.context.lineTo(corner.x, corner.y);
        }

        this.context.stroke();
        this.context.closePath();

        this.context.lineWidth = 3;
        this.context.strokeStyle = "green";
        this.context.strokeRect(corners[0].x - 2, corners[0].y - 2, 4, 4);
    }
};
SKARF.JsArucoArLib.prototype.__drawId = function (markers) {

    var corners, corner, x, y, i, len;

    this.context.font = '12pt Calibri';
    this.context.fillStyle = "yellow";
    // this.context.strokeStyle = "black";
    // this.context.lineWidth = 1.0;

    for (i = 0, len = markers.length; i < len; i++) {
        corners = markers[i].corners;

        x = corners[0].x;
        y = corners[0].y;

        this.context.fillText(markers[i].id, x, y);
        // this.context.strokeText(markers[i].id, x, y);
    }
};

//===================================
// RENDERERS
//===================================

/**
 * Factory which creates SKARF.Renderer<br/>
 * <strong>NOTE: This is meant for internal usage only as the created instance needs some manual variable assignments and initializations before they are usable. These are done internally by a {@linkcode SKARF.Skarf Skarf} instance.</strong>
 * @namespace
 */
SKARF.RendererFactory = {

    mappings: {},

    /**
     * Function to create a SKARF.Renderer instance
     * @param {string} type Type of ArLib to create: 'threejs' (only choice available now)
     * @param {object} options Options
     * @param {THREE.WebGLRenderer} options.renderer Three.js renderer
     * @param {THREE.Scene} options.scene Three.js scene
     * @param {THREE.Camera} options.camera Three.js camera
     * @param {string} options.markersJsonFile Path to a JSON file that specifies markers and models to load
     */
    create: function (type, options) {
        if (!type) {
            throw new Error('SKARF.Renderer type not specified');
        }
        if (!this.mappings.hasOwnProperty(type)) {
            throw new Error('SKARF.Renderer of this type has not been registered with SKARF.RendererFactory: ' + type);
        }
        var renderer = new this.mappings[type](options);
        return renderer;
    },

    /**
     * Registers a type string to a class
     * @param {string} mappingName Name of the mapping which is used to identify the type when creating instances e.g. 'threejs'
     * @param {SKARF.Renderer} mappingClass Renderer class that will be created when the associated type is used
     */
    register: function (mappingName, mappingClass) {
        if (this.mappings.hasOwnProperty(mappingName)) {
            throw new Error('Mapping name already exists: ' + mappingName);
        }
        this.mappings[mappingName] = mappingClass;
    }
};

/**
 * Abstract class for renderers
 * @constructor
 * @abstract
 */
SKARF.Renderer = function (options) {

    if (typeof options.renderer === 'undefined') {
        throw new Error('renderer not specified');
    }
    this.renderer = options.renderer;

    if (typeof options.scene === 'undefined') {
        throw new Error('scene not specified');
    }
    this.scene = options.scene;

    if (typeof options.camera === 'undefined') {
        throw new Error('camera not specified');
    }
    this.camera = options.camera;

    if (typeof options.markersJsonFile === 'undefined') {
        throw new Error('markersJsonFile not specified');
    }
    this.markersJsonFile = options.markersJsonFile;

    this.isWireframeVisible = (typeof options.displayWireframe === 'undefined') ? false : options.displayWireframe;
    this.isLocalAxisVisible = (typeof options.displayLocalAxis === 'undefined') ? false : options.displayLocalAxis;

    this.markerManager = new SKARF.MarkerManager(this.markersJsonFile);
    this.localAxes = [];

    this.markerTransforms = {};

    this.callbacks = {};

    //variables to be assigned by skarf
    this.arLib = null;
    this.backgroundCanvasElem = null;
};
/**
 * Initializes the instance
 */
SKARF.Renderer.prototype.init = function () {
    this.__setupBackgroundVideo();
};
/**
 * Adds a callback function that will be called during specific events
 * @param {string} type Type of callback: 'render' (only choice available now)
 * @param {function} callbackFn Callback function to call
 */
SKARF.Renderer.prototype.addCallback = function (type, callbackFn) {
    if (!this.callbacks.hasOwnProperty(type)) {
        this.callbacks[type] = [];
    }
    if (callbackFn) {
        if (typeof callbackFn === 'function') {
            this.callbacks[type].push(callbackFn);
        } else {
            throw new Error('Specified callbackFn is not a function');
        }
    } else {
        throw new Error('Callback function not defined');
    }
};
/**
 * Returns the designated main marker ID
 * @return {number} main marker ID
 */
SKARF.Renderer.prototype.getMainMarkerId = function () {
    return this.markerManager.markerData.mainMarkerId;
};
/**
 * Updates the renderer
 * @abstract
 * @param  {number} dt Time elapsed since previous frame
 */
SKARF.Renderer.prototype.update = function (dt) {
    throw new Error('Abstract method not implemented');
};
SKARF.Renderer.prototype.__setupBackgroundVideo = function () {
    throw new Error('Abstract method not implemented');
};
SKARF.Renderer.prototype.__createTransformForMarker = function (markerId, markerSize) {
    throw new Error('Abstract method not implemented');
};
/**
 * Shows all children of marker
 * @param {number} markerId ID of marker
 * @param {boolean} visible Whether to show or hide the children
 */
SKARF.Renderer.prototype.showChildrenOfMarker = function (markerId, visible) {
    this.__showChildren(this.markerTransforms[markerId], visible);
};
SKARF.Renderer.prototype.__showChildren = function (object3d, visible) {
    throw new Error('Abstract method not implemented');
};
SKARF.Renderer.prototype.loadForMarker = function (markerId, markerTransform, markerSize) {
    this.markerManager.loadForMarker(markerId, markerTransform, markerSize, this.isWireframeVisible);
};
SKARF.Renderer.prototype.__setCurrSolvedMatrixValues = function (markerId, matrix) {
    throw new Error('Abstract method not implemented');
};
SKARF.Renderer.prototype.__setMarkerDetected = function (markerId, detected) {
    this.markerTransforms[markerId].detected = detected;
};
SKARF.Renderer.prototype.__updateSolvedScene = function (dt, mainMarkerId) {
    throw new Error('Abstract method not implemented');
};
/**
 * Sets visibility of wireframe
 * @abstract
 * @param {boolean} isVisible Visibility of wireframe
 */
SKARF.Renderer.prototype.setWireframeVisible = function (isVisible) {
    throw new Error('Abstract method not implemented');
};
/**
 * Sets visibility of local axis
 * @abstract
 * @param {boolean} isVisible Visibility of local axis
 */
SKARF.Renderer.prototype.setLocalAxisVisible = function (isVisible) {
    throw new Error('Abstract method not implemented');
};

/**
 * Renderer class for Three.js<br/>
 * <strong>Please do not instantiate this class on your own. Use the {@linkcode SKARF.RendererFactory RendererFactory} instead.</strong>
 * @constructor
 * @extends {SKARF.Renderer}
 */
SKARF.ThreeJsRenderer = function (options) {
    // this.markerTransforms = {};
    SKARF.Renderer.call(this, options);

    //temp matrix
    this.mainMarkerRootSolvedMatrixInv = new THREE.Matrix4();
};
//inherit from SKARF.Renderer
SKARF.ThreeJsRenderer.prototype = Object.create(SKARF.Renderer.prototype);
SKARF.ThreeJsRenderer.prototype.constructor = SKARF.ThreeJsRenderer;
//register with factory
SKARF.RendererFactory.register('threejs', SKARF.ThreeJsRenderer);
//override methods
/**
 * Updates the renderer
 * @param  {number} dt Time elapsed since previous frame
 */
SKARF.ThreeJsRenderer.prototype.update = function (dt) {

    //mark texture for update
    this.videoTex.needsUpdate = true;

    //clear renderer first
    this.renderer.autoClear = false;
    this.renderer.clear();

    //check for the callback of type 'render'
    if (this.callbacks.hasOwnProperty('render')) {
        var renderCallbacks = this.callbacks['render'];
        var i, len;
        for (i = 0, len = renderCallbacks.length; i < len; i++) {
            renderCallbacks[i](dt);
        }
    }

    //finally, render actual scene
    this.renderer.render(this.videoScene, this.videoCam);
    this.renderer.render(this.scene, this.camera);
};
SKARF.ThreeJsRenderer.prototype.__showChildren = function (object3d, visible) {
    var children = object3d.children;
    var i, len;
    for (i = 0, len = children.length; i < len; i++) {
        if (!visible) {
            //if hide mode, just hide without caring about the type
            children[i].visible = visible;
        } else {
            //if show mode, just show first
            children[i].visible = visible;
            //if it is an axis, then check also whether it is suppose to be shown
            if (children[i] instanceof THREE.AxisHelper) {
                children[i].visible = children[i].visible && this.isLocalAxisVisible;
            }
        }
    }
};
SKARF.ThreeJsRenderer.prototype.__setupBackgroundVideo = function () {
    //NOTE: must use <canvas> as the texture, not <video>, otherwise there will be a 1-frame lag
    this.videoTex = new THREE.Texture(this.backgroundCanvasElem);
    this.videoPlane = new THREE.PlaneGeometry(2, 2);
    this.videoMaterial = new THREE.MeshBasicMaterial({
        map: this.videoTex,
        depthTest: false,
        depthWrite: false
    });
    var plane = new THREE.Mesh(this.videoPlane, this.videoMaterial);
    this.videoScene = new THREE.Scene();
    this.videoCam = new THREE.Camera();
    this.videoScene.add(plane);
    this.videoScene.add(this.videoCam);
};
SKARF.ThreeJsRenderer.prototype.__createTransformForMarker = function (markerId, markerSize) {
    //FIXME: no need to create a transform if this markerId is not in the models JSON file

    //create a new Three.js object as marker root
    var markerTransform = new THREE.Object3D();
    markerTransform.matrixAutoUpdate = false;
    markerTransform.currSolvedMatrix = new THREE.Matrix4();
    this.markerTransforms[markerId] = markerTransform;

    // Add the marker root to your scene.
    this.scene.add(markerTransform);

    //add a axis helper to see the local axis
    var localAxis = new THREE.AxisHelper(markerSize * 2);
    localAxis.visible = this.isLocalAxisVisible;
    this.localAxes.push(localAxis);
    markerTransform.add(localAxis);

    return markerTransform;
};
SKARF.ThreeJsRenderer.prototype.__setCurrSolvedMatrixValues = function (markerId, matrix) {
    this.markerTransforms[markerId].currSolvedMatrix.copy(matrix);
};
/**
 * Sets visibility of wireframe
 * @param {boolean} isVisible Visibility of wireframe
 */
SKARF.ThreeJsRenderer.prototype.setWireframeVisible = function (isVisible) {

    this.isWireframeVisible = isVisible;

    var i, j, leni, lenj, m;
    for (i = 0, leni = this.markerManager.materials.length; i < leni; i++) {
        m = this.markerManager.materials[i];
        if (m instanceof THREE.MeshFaceMaterial) {
            for (j = 0, lenj = m.materials.length; j < lenj; j++) {
                m.materials[j].wireframe = isVisible;
            }
        } else {
            m.wireframe = isVisible;
        }
    }
};
/**
 * Sets visibility of local axis
 * @param {boolean} isVisible Visibility of local axis
 */
SKARF.ThreeJsRenderer.prototype.setLocalAxisVisible = function (isVisible) {
    this.isLocalAxisVisible = isVisible;
    var i, len;
    for (i = 0, len = this.localAxes.length; i < len; i++) {
        this.localAxes[i].visible = isVisible;
    }
};
SKARF.ThreeJsRenderer.prototype.__updateSolvedScene = function (dt, mainMarkerId) {

    var mainMarkerIdDetected = this.markerTransforms[mainMarkerId] && this.markerTransforms[mainMarkerId].detected;
    if (mainMarkerIdDetected) {

        //move the camera instead of the marker root
        this.camera.matrix.copy(this.arLib.compensationMatrix);  //compensate coordinate system and up vector differences
        this.camera.matrix.multiply(this.mainMarkerRootSolvedMatrixInv.getInverse(this.markerTransforms[mainMarkerId].currSolvedMatrix));  //multiply inverse of main marker's matrix will force main marker to be at origin and the camera to transform around this world space
        this.camera.matrixWorldNeedsUpdate = true;
    }

    //for each of the marker root detected, move into the space of the main marker root
    var that = this;
    Object.keys(this.markerTransforms).forEach(function (key) {
        if (that.markerTransforms[key].detected) {

            //transform and compensate
            that.markerTransforms[key].matrix.copy(that.camera.matrix);  //transform into new camera world space first
            that.markerTransforms[key].matrix.multiply(that.markerTransforms[key].currSolvedMatrix);  //since currSolvedMatrix is relative to camera space, multiplying by it next will bring this object into world space
            that.markerTransforms[key].matrix.multiply(that.arLib.compensationMatrix);  //compensate back into the right coordinate system, locally
            that.markerTransforms[key].matrixWorldNeedsUpdate = true;

            //show the object
            that.__showChildren(that.markerTransforms[key], true);

            //call detected() on the GUI markers
            if (that.markerTransforms[key].guiMarker) {
                that.markerTransforms[key].guiMarker.detected(dt, that.markerTransforms[key].matrix);
            }
        } else {

            //no need to transform

            //hide the object
            that.__showChildren(that.markerTransforms[key], false);

            //call hidden() on the GUI markers
            if (that.markerTransforms[key].guiMarker) {
                that.markerTransforms[key].guiMarker.hidden();
            }
        }
    });
};
//methods
/**
 * Initializes the camera projection matrix
 * @param  {Three.Matrix4} camProjMatrixArray Camera projection matrix
 */
SKARF.ThreeJsRenderer.prototype.initCameraProjMatrix = function (camProjMatrixArray) {
    this.camera.projectionMatrix.setFromArray(camProjMatrixArray);
};

//===================================
// SKARF
//===================================

/**
 * Class which handles different augmented reality libraries
 * @constructor
 * @param {object} options Options
 * @param {string} options.arLibType ArLib type: 'jsartoolkit, 'jsaruco'
 * @param {video | img | canvas} options.trackingElem DOM element used for tracking, such as a video, img or canvas
 * @param {number} options.markerSize Size of marker in mm, determines scale of scene
 * @param {number} [options.verticalFov] Vertical field-of-view of web cam (you will have to estimate this). For JSARToolKit,, if this is not defined, it will use a generic vertical field-of-view which seems to work well for general web cams.
 * @param {number} [options.threshold=128] Threshold value for turning tracking stream into a binary image. Ranges from 0 to 255. Used only for JSARToolKit.
 * @param {boolean} [options.debug=false] Whether to turn on debug view/mode
 * @param {canvas} [options.canvasContainerElem] Div DOM element to append a newly-created tracking canvas to. If not specified, the newly-created canvas will just be appended to the body DOM element.
 * @param {string} options.rendererType Renderer type: 'threejs'
 * @param {THREE.WebGLRenderer} options.renderer Three.js renderer
 * @param {THREE.Scene} options.scene Three.js scene
 * @param {THREE.Camera} options.camera Three.js camera
 * @param {string} options.markersJsonFile Path to a JSON file that specifies markers and models to load
 */
SKARF.Skarf = function (options) {

    //AR lib parameters
    if (typeof options.arLibType === 'undefined') {
        throw new Error('arLibType not specified');
    }
    this.arLibType = options.arLibType;
    if (typeof options.trackingElem === 'undefined') {
        throw new Error('trackingElem not specified');
    }
    this.trackingElem = options.trackingElem;
    if (typeof options.markerSize === 'undefined') {
        throw new Error('markerSize not specified');
    }
    this.markerSize = options.markerSize;
    this.verticalFov = options.verticalFov;
    this.threshold = options.threshold || 128;
    this.debug = typeof options.debug === 'undefined' ? false : options.debug;

    //canvas
    this.canvasContainerElem = options.canvasContainerElem;

    //renderer parameters
    this.rendererType = 'threejs';  //only create Three.js instances
    if (typeof options.renderer === 'undefined') {
        throw new Error('renderer not specified');
    }
    this.renderer = options.renderer;
    if (typeof options.scene === 'undefined') {
        throw new Error('scene not specified');
    }
    this.scene = options.scene;
    if (typeof options.camera === 'undefined') {
        throw new Error('camera not specified');
    }
    this.camera = options.camera;
    if (typeof options.markersJsonFile === 'undefined') {
        throw new Error('markersJsonFile not specified');
    }
    this.markersJsonFile = options.markersJsonFile;

    //init
    this.__init();
};
SKARF.Skarf.prototype.__create2dCanvas = function () {

    //create canvas
    this.canvasElem = document.createElement('canvas');

    //canvas should be same width/height as the tracking element
    this.canvasElem.width = this.trackingElem.width;
    this.canvasElem.height = this.trackingElem.height;

    //attach to container if specified, otherwise attach to body
    if (this.canvasContainerElem) {
        this.canvasContainerElem.append(this.canvasElem);
    } else {
        $('body').append(this.canvasElem);
    }

    //store the 2d context
    this.context = this.canvasElem.getContext('2d');
};
SKARF.Skarf.prototype.__init = function () {

    //create a 2d canvas for copying data from tracking element
    this.__create2dCanvas();

    //create renderer instance
    this.renderer = SKARF.RendererFactory.create(this.rendererType, {
        renderer: this.renderer,
        scene: this.scene,
        camera: this.camera,
        markersJsonFile: this.markersJsonFile
    });

    //create AR lib instance
    this.arLib = SKARF.ArLibFactory.create(this.arLibType, {
        trackingElem: this.trackingElem,
        markerSize: this.markerSize,
        verticalFov: this.verticalFov,
        mainMarkerId: this.renderer.getMainMarkerId(),
        threshold: this.threshold,
        debug: this.debug
    });

    //assign necessary pointers of itself to each other
    this.arLib.renderer = this.renderer;
    this.renderer.arLib = this.arLib;

    //assign the canvas to arLib and renderer
    this.arLib.canvasElem = this.canvasElem;
    this.renderer.backgroundCanvasElem = this.canvasElem;

    //finally call init of both
    this.renderer.init();
    this.arLib.init();
};
/**
 * Draws tracking data to canvas, and then updates both the AR lib and renderer
 * @param {number} dt Elapsed time since previous frame
 */
SKARF.Skarf.prototype.update = function (dt) {
    //draw the video/img to canvas
    // if (this.videoElem.readyState === this.videoElem.HAVE_ENOUGH_DATA) {

    this.context.drawImage(this.trackingElem, 0, 0, this.canvasElem.width, this.canvasElem.height);
    this.canvasElem.changed = true;

    //call updates
    this.arLib.update(dt);
    this.renderer.update(dt);

    // }
};
/**
 * Adds a callback function that will be called during specific events
 * @param {string} type Type of callback: 'render' (only choice available now)
 * @param {function} callbackFn Callback function to call
 */
SKARF.Skarf.prototype.addCallback = function (type, callbackFn) {
    //pass all callbacks to renderer for now
    //TODO: manage callbacks better
    this.renderer.addCallback(type, callbackFn);
};
/**
 * Returns true if the designated main marker has been detected
 * @return {bool} True if the designated main marker has been detected
 */
SKARF.Skarf.prototype.mainMarkerDetected = function () {
    return this.arLib.mainMarkerHasEverBeenDetected;
};
/**
 * Inits camera projection matrix, used only for JSARToolKit.
 * This is called automatically during initialization. Call this function only if you need to re-initialize the camera projection matrix again.
 */
SKARF.Skarf.prototype.initCameraProjMatrix = function () {
    if (this.arLib instanceof SKARF.JsArToolKitArLib) {
        this.arLib.initCameraProjMatrix();
    }
};