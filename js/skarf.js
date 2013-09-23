/**
 * skarf.js
 * A JavaScript augmented reality framework for handling augmented reality libraries
 * 
 * Copyright (C) 2013 Skeel Lee (skeel@skeelogy.com)
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
 * @fileOverview A JavaScript augmented reality framework for handling augmented reality libraries
 * @author Skeel Lee <skeel@skeelogy.com>
 * @version 1.0.0
 *
 * @since 25 Jun 2013
 *
 * Usage:
 *
 * //create an AR framework (SkArF)
 * var skarf = new SkArF({...});
 *
 * //within the main loop, call:
 * skarf.update(dt);
 *
 * If you wish to use your own AR library (e.g. JsArToolKitArLib):
 * 1) Subclass ArLib
 * 2) Register with factory: ArLibFactory.register('jsartoolkit', JsArToolKitArLib);
 * 3) Override the init(), loop() and other methods
 */


//===================================
// GUI Markers
//===================================

/**
 * Factory that creates GuiMarker
 */
GuiMarkerFactory = {
    mappings: {},

    create: function (type, options) {
        if (!type) {
            throw new Error('GuiMarker type not specified');
        }
        if (!this.mappings.hasOwnProperty(type)) {
            throw new Error('GuiMarker of this type has not been registered with GuiMarkerFactory: ' + type);
        }
        var guiMarker = new this.mappings[type](options);
        return guiMarker;
    },

    register: function (mappingName, mappingClass) {
        if (this.mappings.hasOwnProperty(mappingName)) {
            throw new Error('Mapping name already exists: ' + mappingName);
        }
        this.mappings[mappingName] = mappingClass;
    }
}

/**
 * An augmented reality marker
 * @constructor
 */
function GuiMarker(options) {
    if (typeof options.key === 'undefined') {
        throw new Error('key not specified');
    }
    this.key = options.key;
    if (typeof options.name === 'undefined') {
        throw new Error('name not specified');
    }
    this.name = options.name;
    if (typeof options.markerId === 'undefined') {
        throw new Error('markerId not specified');
    }
    this.markerId = options.markerId;
    if (typeof options.markerTransform === 'undefined') {
        throw new Error('markerTransform not specified');
    }
    this.markerTransform = options.markerTransform;
    //TODO: determine if markerSize is needed
    if (typeof options.markerSize === 'undefined') {
        throw new Error('markerSize not specified');
    }
    this.markerSize = options.markerSize;

    this.firstDetected = true;
    this.firstHidden = false;

    this.worldMatrix = null;

    //variables for position
    this.position = new THREE.Vector3();
    this.prevPosition = new THREE.Vector3();
    this.dPosition = new THREE.Vector3();
    this.moveThresholdLow = 0.02;  //to ignore slight flickerings
    this.moveThresholdHigh = 0.5;  //in case axes flip and a large change occurs

    //variables for rotation
    this.worldZAxis = new THREE.Vector3(0, 0, 1);
    this.worldYAxis = new THREE.Vector3(0, 1, 0);
    this.currZAxis = new THREE.Vector3();
    this.rotation = 0;
    this.prevRotation = 0;
    this.dRotation = 0;
    this.rotThresholdLow = 1.0;  //to ignore slight flickerings
    this.rotThresholdHigh = 10.0;  //in case axes flip and a large change occurs

    //callback objects
    this.callbackObjs = {};
    this.callbackObjs['moved'] = {name: this.key+'_moved', fn: undefined};
    this.callbackObjs['rotated'] = {name: this.key+'_rotated', fn: undefined};
    this.callbackObjs['firstDetected'] = {name: this.key+'_firstDetected', fn: undefined};
    this.callbackObjs['firstHidden'] = {name: this.key+'_firstHidden', fn: undefined};
    this.callbackObjs['detected'] = {name: this.key+'_detected', fn: undefined};
    this.callbackObjs['hidden'] = {name: this.key+'_hidden', fn: undefined};
}
GuiMarker.prototype.detected = function (dt, worldMatrix) {

    //store world matrix first
    this.worldMatrix = worldMatrix;

    //get position and rotation
    this.processPosition(worldMatrix);
    this.processRotation(worldMatrix);

    //process callbacks
    this.processCallbacks();

    //turn off firstDetected
    this.firstDetected = false;

    //turn on first hidden, for the next hide
    this.firstHidden = true;
};
GuiMarker.prototype.processPosition = function (worldMatrix) {

    this.position.getPositionFromMatrix(worldMatrix);

    //check if marker has moved
    this.dPosition.copy(this.position.clone().sub(this.prevPosition));
    var movedDist = this.dPosition.length();
    if (movedDist >= this.moveThresholdLow && movedDist <= this.moveThresholdHigh) {
        //call the moved callback
        this.invokeCallback('moved', {guiMarker: this, position: this.position, dPosition: this.dPosition});
    }

    //store the previous position
    this.prevPosition.copy(this.position);
};
GuiMarker.prototype.processRotation = function (worldMatrix) {

    //NOTE: tried to extract the Euler Y rotation and then take the difference but can't seem to get it to work.
    //So I'm finding the angle between local Z and world Z manually

    //get the current X axis
    this.currZAxis.getColumnFromMatrix(2, worldMatrix).normalize();

    //find the current angle (against world Z)
    this.rotation = THREE.Math.radToDeg(Math.acos(this.currZAxis.dot(this.worldZAxis)));

    //check cross product against world Y
    var orthoAxis = new THREE.Vector3().crossVectors(this.currZAxis, this.worldZAxis);
    var orthoAngle = orthoAxis.dot(this.worldYAxis);
    if (orthoAngle < 0) {  //opposite side
        this.rotation = 360 - this.rotation;
    }

    this.dRotation = this.rotation - this.prevRotation;
    var absDRot = Math.abs(this.dRotation);
    if (!isNaN(this.dRotation) && absDRot >= this.rotThresholdLow && absDRot <= this.rotThresholdHigh) {
        this.invokeCallback('rotated', {guiMarker: this, rotation: this.rotation, dRotation: this.dRotation});
    }

    //store prev rotation
    this.prevRotation = this.rotation;
};
GuiMarker.prototype.processCallbacks = function () {

    //call detected callback
    this.invokeCallback('detected', {guiMarker: this, worldMatrix: this.worldMatrix, position: this.position, rotation: this.rotation});

    //call firstDetected callback
    if (this.firstDetected) {
        this.invokeCallback('firstDetected', {guiMarker: this, worldMatrix: this.worldMatrix, position: this.position, rotation: this.rotation});
    }
};
GuiMarker.prototype.hidden = function () {

    //turn on firstDetected, for the next detection
    this.firstDetected = true;

    //call firstHidden callback
    if (this.firstHidden) {
        this.invokeCallback('firstHidden', {guiMarker: this});
        this.firstHidden = false;
    }

    //call hidden callback
    this.invokeCallback('hidden', {guiMarker: this});
};
GuiMarker.prototype.invokeCallback = function (type, options) {

    var callbackObj = this.callbackObjs[type];

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
}

/**
 * Generic GuiMarker
 * @constructor
 * @extends {GuiMarker}
 */
function GenericMarker(options) {
    GuiMarker.call(this, options);
}
//inherit
GenericMarker.prototype = Object.create(GuiMarker.prototype);
GenericMarker.prototype.constructor = GenericMarker;
//register with factory
GuiMarkerFactory.register('generic', GenericMarker);

/**
 * GuiMarker that activates once until the marker is next shown
 * @constructor
 * @extends {GuiMarker}
 */
function ButtonMarker(options) {
    GuiMarker.call(this, options);
    this.callbackObjs['clicked'] = {name: this.key+'_clicked', fn: undefined};
}
//inherit
ButtonMarker.prototype = Object.create(GuiMarker.prototype);
ButtonMarker.prototype.constructor = ButtonMarker;
//register with factory
GuiMarkerFactory.register('button', ButtonMarker);
//override
ButtonMarker.prototype.processCallbacks = function () {
    if (this.firstDetected) {
        this.invokeCallback('clicked', {guiMarker: this});
    }
    GuiMarker.prototype.processCallbacks.call(this);
};

/**
 * GuiMarker that toggles an on/off state once until the marker is next shown
 * @constructor
 * @extends {GuiMarker}
 */
function CheckBoxMarker(options) {
    GuiMarker.call(this, options);
    this.callbackObjs['toggled'] = {name: this.key+'_toggled', fn: undefined};
    this.checked = false;
}
//inherit
CheckBoxMarker.prototype = Object.create(GuiMarker.prototype);
CheckBoxMarker.prototype.constructor = CheckBoxMarker;
//register with factory
GuiMarkerFactory.register('checkbox', CheckBoxMarker);
//override
CheckBoxMarker.prototype.processCallbacks = function () {
    if (this.firstDetected) {
        this.checked = !this.checked;
        this.invokeCallback('toggled', {guiMarker: this, checked: this.checked});
    }
    GuiMarker.prototype.processCallbacks.call(this);
};

/**
 * GuiMarker that emulates an attribute-changing slider by rotating
 * @constructor
 * @extends {GuiMarker}
 */
function SliderMarker(options) {
    GuiMarker.call(this, options);
    this.speed = options.params && options.params.speed ? options.params.speed : 1.0;
    this.callbackObjs['changed'] = {name: this.key+'_changed', fn: undefined};
}
//inherit
SliderMarker.prototype = Object.create(GuiMarker.prototype);
SliderMarker.prototype.constructor = SliderMarker;
//register with factory
GuiMarkerFactory.register('slider', SliderMarker);
//override
SliderMarker.prototype.processCallbacks = function () {
    var absDRot = Math.abs(this.dRotation);
    if (!isNaN(this.dRotation) && absDRot >= this.rotThresholdLow && absDRot <= this.rotThresholdHigh) {
        this.invokeCallback('changed', {guiMarker: this, delta: this.dRotation * this.speed});
    }
    GuiMarker.prototype.processCallbacks.call(this);
};

/**
 * GuiMarker that emulates a combo box. Selection is based on orientation of marker.
 * @constructor
 * @extends {GuiMarker}
 */
function ComboBoxMarker(options) {
    GuiMarker.call(this, options);
    this.callbackObjs['changed'] = {name: this.key+'_changed', fn: undefined};
    if (!(options.params && options.params.numChoices)) {
        throw new Error('numChoices not specified as a parameter');
    }
    this.numChoices = options.params.numChoices;
    this.currId = 0;
}
//inherit
ComboBoxMarker.prototype = Object.create(GuiMarker.prototype);
ComboBoxMarker.prototype.constructor = ComboBoxMarker;
//register with factory
GuiMarkerFactory.register('combobox', ComboBoxMarker);
//override
ComboBoxMarker.prototype.processCallbacks = function () {
    var newId = Math.floor(this.rotation / 360.0 * this.numChoices);
    if (newId !== this.currId) {
        this.invokeCallback('changed', {guiMarker: this, selectedId: newId, rotation: this.rotation});
        this.currId = newId;
    }
    GuiMarker.prototype.processCallbacks.call(this);
};

/**
 * GuiMarker that activates after a certain amount of time
 * @constructor
 * @extends {GuiMarker}
 */
function TimerMarker(options) {
    GuiMarker.call(this, options);
    this.callbackObjs['reached'] = {name: this.key+'_reached', fn: undefined};
    this.time = options.params && options.params.time || 2.0;
    this.currTime = 0;
    this.reached = false;
}
//inherit
TimerMarker.prototype = Object.create(GuiMarker.prototype);
TimerMarker.prototype.constructor = TimerMarker;
//register with factory
GuiMarkerFactory.register('timer', TimerMarker);
//override
TimerMarker.prototype.detected = function (dt, worldMatrix) {
    GuiMarker.prototype.detected.call(this, dt, worldMatrix);
    this.currTime += dt;
    if (!this.reached && this.currTime >= this.time) {
        this.reached = true;
        this.invokeCallback('reached', {guiMarker: this});
    }
};
TimerMarker.prototype.hidden = function () {

    //reset if marker disappears
    this.currTime = 0;
    this.reached = false;

    GuiMarker.prototype.hidden.call(this);
};
TimerMarker.prototype.resetTimer = function () {
    this.currTime = 0;
};


//===================================
// Model Loaders
//===================================

/**
 * Factory which creates ModelLoader
 */
var ModelLoaderFactory = {

    mappings: {},

    create: function (type) {
        if (!type) {
            throw new Error('Model type not specified');
        }
        if (!this.mappings.hasOwnProperty(type)) {
            throw new Error('ModelLoader of this type has not been registered with ModelLoaderFactory: ' + type);
        }
        var loader = new this.mappings[type]();
        return loader;
    },

    register: function (mappingName, mappingClass) {
        if (this.mappings.hasOwnProperty(mappingName)) {
            throw new Error('Mapping name already exists: ' + mappingName);
        }
        this.mappings[mappingName] = mappingClass;
    }
};

/**
 * Superclass for model loaders
 * @constructor
 */
function ModelLoader() {
    this.loader = null;
}
/**
 * Loads model for marker
 * @param  {number}  markerId ID of marker to laod
 * @param  {THREE.Object3D}  markerTransform Transform to parent to after model has Loaded
 * @param  {number}  overallScale Overall scale
 * @param  {boolean} isWireframeVisible Whether to initialize the wireframe mode to true
 * @param  {MarkerManager} markerManager marker manager instance
 */
ModelLoader.prototype.loadForMarker = function (markerId, markerTransform, overallScale, isWireframeVisible, markerManager) {
    throw new Error('Abstract method not implemented');
};
ModelLoader.prototype.transformAndParent = function (model, object, markerTransform, overallScale, markerManager) {

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
 * Model loader which contains no models
 * @constructor
 * @extends {ModelLoader}
 */
function EmptyModelLoader() {
    ModelLoader.call(this);
    this.loader = new THREE.JSONLoader();
    console.log('Created a EmptyModelLoader');
}

//inherit from ModelLoader
EmptyModelLoader.prototype = Object.create(ModelLoader.prototype);
EmptyModelLoader.prototype.constructor = EmptyModelLoader;

//register with factory
ModelLoaderFactory.register('empty', EmptyModelLoader);

//override methods
/**
 * Loads model for marker
 * @param  {object}  model Data containing the model info (from JSON file)
 * @param  {number}  markerId ID of marker to laod
 * @param  {THREE.Object3D}  markerTransform Transform to parent to after model has Loaded
 * @param  {number}  overallScale Overall scale
 * @param  {boolean} isWireframeVisible Whether to initialize the wireframe mode to true
 * @param  {MarkerManager} markerManager marker manager instance
 */
EmptyModelLoader.prototype.loadForMarker = function (model, markerId, markerTransform, overallScale, isWireframeVisible, markerManager) {
    //TODO: time how long it takes to load

    //bake transformations into vertices
    this.transformAndParent(model, null, markerTransform, overallScale, markerManager);

    console.log('Loaded empty transform for marker id ' + markerId);
};

/**
 * Model loader which contains Three.js JSON model data
 * @constructor
 * @extends {ModelLoader}
 */
function JsonModelLoader() {
    ModelLoader.call(this);
    this.loader = new THREE.JSONLoader();
    console.log('Created a JsonModelLoader');
}

//inherit from ModelLoader
JsonModelLoader.prototype = Object.create(ModelLoader.prototype);
JsonModelLoader.prototype.constructor = JsonModelLoader;

//register with factory
ModelLoaderFactory.register('json', JsonModelLoader);

//override methods
/**
 * Loads model for marker
 * @param  {object}  model Data containing the model info (from JSON file)
 * @param  {number}  markerId ID of marker to laod
 * @param  {THREE.Object3D}  markerTransform Transform to parent to after model has Loaded
 * @param  {number}  overallScale Overall scale
 * @param  {boolean} isWireframeVisible Whether to initialize the wireframe mode to true
 * @param  {MarkerManager} markerManager marker manager instance
 */
JsonModelLoader.prototype.loadForMarker = function (model, markerId, markerTransform, overallScale, isWireframeVisible, markerManager) {
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
 * @constructor
 * @extends {ModelLoader}
 */
function JsonBinaryModelLoader() {
    ModelLoader.call(this);
    if (typeof THREE.BinaryLoader === 'undefined') {
        throw new Error('THREE.BinaryLoader does not exist. Have you included BinaryLoader.js?');
    }
    this.loader = new THREE.BinaryLoader();
    console.log('Created a JsonBinaryModelLoader');
}

//inherit from JsonModelLoader
JsonBinaryModelLoader.prototype = Object.create(JsonModelLoader.prototype);
JsonBinaryModelLoader.prototype.constructor = JsonBinaryModelLoader;

//register with factory
ModelLoaderFactory.register('json_bin', JsonBinaryModelLoader);


/**
 * Model loader which contains OBJ models
 * @constructor
 * @extends {ModelLoader}
 */
function ObjModelLoader() {

    ModelLoader.call(this);

    if (typeof THREE.OBJMTLLoader === 'undefined') {
        throw new Error('THREE.OBJMTLLoader does not exist. Have you included OBJMTLLoader.js and MTLLoader.js?');
    }
    this.loader = new THREE.OBJMTLLoader();
    console.log('Created a ObjModelLoader');

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
}

//inherit from ModelLoader
ObjModelLoader.prototype = Object.create(ModelLoader.prototype);
ObjModelLoader.prototype.constructor = ObjModelLoader;

//register with factory
ModelLoaderFactory.register('obj', ObjModelLoader);

//override methods
/**
 * Loads model for marker
 * @param  {object}  model Data containing the model info (from JSON file)
 * @param  {number}  markerId ID of marker to laod
 * @param  {THREE.Object3D}  markerTransform Transform to parent to after model has Loaded
 * @param  {number}  overallScale Overall scale
 * @param  {boolean} isWireframeVisible Whether to initialize the wireframe mode to true
 * @param  {MarkerManager} markerManager marker manager instance
 */
ObjModelLoader.prototype.loadForMarker = function (model, markerId, markerTransform, overallScale, isWireframeVisible, markerManager) {

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
// Marker Manager
//===================================

//TODO: this is Three.js specific, have to separate out into its own subclass

/**
 * Manager to manage markers, both for models and GuiMarkers
 * @constructor
 */
function MarkerManager(markersJsonFile) {
    this.markersJsonFile = markersJsonFile;

    this.markerData = null;
    this.modelLoaders = {};

    this.materials = [];

    this.load();
}
MarkerManager.prototype.load = function () {
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
 * @param  {number}  markerId ID of marker to laod
 * @param  {THREE.Object3D}  markerTransform Transform to parent to after model has Loaded
 * @param  {number}  markerSize Size of marker
 * @param  {boolean} isWireframeVisible Whether to initialize the wireframe mode to true
 */
MarkerManager.prototype.loadForMarker = function (markerId, markerTransform, markerSize, isWireframeVisible) {

    //two types of markers to load:

    if (this.markerData.models && this.markerData.models[markerId]) {
        //1) models
        var model = this.markerData.models[markerId];
        if (model) {
            var type = model.type;
            if (!this.modelLoaders.hasOwnProperty(type)) {
                //create a loader using ModelLoaderFactory
                this.modelLoaders[type] = ModelLoaderFactory.create(type);
            }
            this.modelLoaders[type].loadForMarker(model, markerId, markerTransform, markerSize, isWireframeVisible, this);
        }
    } else if (this.markerData.guiMarkers && this.markerData.guiMarkers[markerId]) {
        //2) GUI markers
        var guiMarker = this.markerData.guiMarkers[markerId];
        if (guiMarker) {
            var type = guiMarker.type;
            var guiMarker = GuiMarkerFactory.create(type, {
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
// Helpers
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
// AR Libraries
//===================================

/**
 * Factory which creates ArLib
 */
var ArLibFactory = {

    mappings: {},

    create: function (type, options) {
        if (!type) {
            throw new Error('ArLib type not specified');
        }
        if (!this.mappings.hasOwnProperty(type)) {
            throw new Error('ArLib of this type has not been registered with ArLibFactory: ' + type);
        }
        var arLib = new this.mappings[type](options);
        return arLib;
    },

    register: function (mappingName, mappingClass) {
        if (this.mappings.hasOwnProperty(mappingName)) {
            throw new Error('Mapping name already exists: ' + mappingName);
        }
        this.mappings[mappingName] = mappingClass;
    }
};

/**
 * Superclass for ArLib
 * @constructor
 */
function ArLib(options) {

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
}
/**
 * Initializes the instance
 */
ArLib.prototype.init = function () {
    throw new Error('Abstract method not implemented');
};
/**
 * Updates the instance
 * @param  {number} dt time elapsed
 */
ArLib.prototype.update = function (dt) {
    throw new Error('Abstract method not implemented');
};

/**
 * ArLib class for JSARToolKit
 * @constructor
 * @extends {ArLib}
 */
function JsArToolKitArLib(options) {
    ArLib.call(this, options);

    this.threshold = options.threshold || 128;

    this.compensationMatrix = new THREE.Matrix4().makeScale(1, 1, -1);  //scale in -z to swap from LH-coord to RH-coord
    this.compensationMatrix.multiply(new THREE.Matrix4().makeRotationX(THREE.Math.degToRad(90)));  //rotate 90deg in X to get Y-up;

    //store some temp variables
    this.resultMat = new NyARTransMatResult();
    this.tmp = {};
}

//inherit from ArLib
JsArToolKitArLib.prototype = Object.create(ArLib.prototype);
JsArToolKitArLib.prototype.constructor = JsArToolKitArLib;

//register with factory
ArLibFactory.register('jsartoolkit', JsArToolKitArLib);

//override methods
/**
 * Initializes the instance
 */
JsArToolKitArLib.prototype.init = function () {
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
 * Initializes the camera projection matrix
 */
JsArToolKitArLib.prototype.initCameraProjMatrix = function () {
    var camProjMatrixArray = new Float32Array(16);
    this.flarParam.copyCameraMatrix(camProjMatrixArray, 0.1, 10000);
    this.renderer.initCameraProjMatrix(camProjMatrixArray);
};
/**
 * Updates the instance
 * @param  {number} dt elapsed time
 */
JsArToolKitArLib.prototype.update = function (dt) {

    DEBUG = this.debug;

    //set all markers detected to false first
    var keys = Object.keys(this.markers);
    var i, j;
    for (i = 0; i < keys.length; i++) {
        this.renderer.setMarkerDetected(keys[i], false);
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
            var transform = this.renderer.createTransformForMarker(currId, this.markerSize);

            //delay-load the model
            this.renderer.loadForMarker(currId, transform, this.markerSize);

            //if this is the main marker id, turn on flag
            if (currId == this.mainMarkerId) {  //double equals for auto type conversion
                this.mainMarkerHasEverBeenDetected = true;
            }
        }

        try
        {
            // Get the transformation matrix for the detected marker.
            this.detector.getTransformMatrix(i, this.resultMat);

            // Copy the marker matrix to the tmp matrix.
            copyMarkerMatrix(this.resultMat, this.tmp);

            //store the current solved matrix first
            this.tmpMat.setFromArray(this.tmp);
            this.renderer.setCurrSolvedMatrixValues(currId, this.tmpMat);

            //register that this marker has been detected
            this.renderer.setMarkerDetected(currId, true);
        }
        catch (err)
        {
            //just print to console but let the error pass so that the program can continue
            console.log(err.message);
        }
    }

    //update the solved scene
    this.renderer.updateSolvedScene(dt, this.mainMarkerId);
};

/**
 * ArLib for js-aruco
 * @constructor
 * @extends {ArLib}
 */
function JsArucoArLib(options) {
    ArLib.call(this, options);
}

//inherit from ArLib
JsArucoArLib.prototype = Object.create(ArLib.prototype);
JsArucoArLib.prototype.constructor = JsArucoArLib;

//register with factory
ArLibFactory.register('jsaruco', JsArucoArLib);

//override methods
/**
 * Initializes the instance
 */
JsArucoArLib.prototype.init = function () {
    this.detector = new AR.Detector();

    //NOTE: the second parameter is suppose to be canvasWidth (from the js-aruco example).
    //However, it cannot work when I change the aspect ratio of the tracking canvas.
    //It seems as though the tracking canvas must be 4:3, so I'm doing some compensation here to allow any aspect ratio.
    this.posit = new POS.Posit(this.markerSize, this.canvasElem.height * 4.0 / 3.0);

    this.context = this.canvasElem.getContext('2d');
};
/**
 * Updates the instance
 * @param  {number} dt elapsed time
 */
JsArucoArLib.prototype.update = function (dt) {
    var imageData = this.context.getImageData(0, 0, this.canvasElem.width, this.canvasElem.height);
    var markers = this.detector.detect(imageData);
    if (this.debug) {
        this.__drawCorners(markers);
        this.__drawId(markers);
    }

    //update scene
    this.__updateScenes(dt, markers);
};
JsArucoArLib.prototype.__updateScenes = function (dt, markers) {
    var corners, corner, pose, i, markerId;

    //set all markers detected to false first
    var keys = Object.keys(this.markers);
    var i, j;
    for (i = 0; i < keys.length; i++) {
        this.renderer.setMarkerDetected(keys[i], false);
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
            var transform = this.renderer.createTransformForMarker(markerId, this.markerSize);

            //delay-load the model
            this.renderer.loadForMarker(markerId, transform, this.markerSize);

            //if this is the main marker id, turn on flag
            if (markerId == this.mainMarkerId) {  //double equals for auto type conversion
                this.mainMarkerHasEverBeenDetected = true;
            }
        }

        //align corners to center of canvas
        var j;
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
            this.updateMatrix4FromRotAndTrans(pose.bestRotation, pose.bestTranslation);
            this.tmpMat.multiply(new THREE.Matrix4().makeRotationX(THREE.Math.degToRad(90)));
            this.renderer.setCurrSolvedMatrixValues(markerId, this.tmpMat);

            //register that this marker has been detected
            this.renderer.setMarkerDetected(markerId, true);

        } catch (err) {
            //just print to console but let the error pass so that the program can continue
            console.log(err.message);
        }
    }

    //update the solved scene
    this.renderer.updateSolvedScene(dt, this.mainMarkerId);
};
JsArucoArLib.prototype.updateMatrix4FromRotAndTrans = function (rotationMat, translationVec) {
    this.tmpMat.set(
        rotationMat[0][0], rotationMat[0][1], -rotationMat[0][2], translationVec[0],
        rotationMat[1][0], rotationMat[1][1], -rotationMat[1][2], translationVec[1],
        -rotationMat[2][0], -rotationMat[2][1], rotationMat[2][2], -translationVec[2],
        0, 0, 0, 1);
};
JsArucoArLib.prototype.__drawCorners = function (markers) {

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
JsArucoArLib.prototype.__drawId = function (markers) {

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
// Renderers
//===================================

/**
 * Factory which creates Renderer
 */
var RendererFactory = {

    mappings: {},

    create: function (type, options) {
        if (!type) {
            throw new Error('Renderer type not specified');
        }
        if (!this.mappings.hasOwnProperty(type)) {
            throw new Error('Renderer of this type has not been registered with RendererFactory: ' + type);
        }
        var renderer = new this.mappings[type](options);
        return renderer;
    },

    register: function (mappingName, mappingClass) {
        if (this.mappings.hasOwnProperty(mappingName)) {
            throw new Error('Mapping name already exists: ' + mappingName);
        }
        this.mappings[mappingName] = mappingClass;
    }
};

/**
 * Superclass for renderers
 * @constructor
 */
function Renderer(options) {
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

    this.markerManager = new MarkerManager(this.markersJsonFile);
    this.localAxes = [];

    this.callbacks = {};

    //variables to be assigned by skarf
    this.arLib = null;
    this.backgroundCanvasElem = null;
}
Renderer.prototype.init = function () {
    this.setupBackgroundVideo();
};
/**
 * Adds a callback function that will be called during specific events
 * @param {string} type Type of callback e.g. 'render'
 * @param {function} callbackFn Callback function to call
 */
Renderer.prototype.addCallback = function (type, callbackFn) {
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
Renderer.prototype.getMainMarkerId = function () {
    return this.markerManager.markerData.mainMarkerId;
};
/**
 * Updates the renderer
 * @param  {number} dt time elapsed
 */
Renderer.prototype.update = function (dt) {
    throw new Error('Abstract method not implemented');
};
Renderer.prototype.setupBackgroundVideo = function () {
    throw new Error('Abstract method not implemented');
};
Renderer.prototype.createTransformForMarker = function (markerId, markerSize) {
    throw new Error('Abstract method not implemented');
};
/**
 * Sets visibility of wireframe
 * @param {boolean} isVisible Visibility of wireframe
 */
Renderer.prototype.setWireframeVisible = function (isVisible) {
    throw new Error('Abstract method not implemented');
};
/**
 * Sets visibility of local axis
 * @param {boolean} isVisible Visibility of local axis
 */
Renderer.prototype.setLocalAxisVisible = function (isVisible) {
    throw new Error('Abstract method not implemented');
};
/**
 * Sets visibility of origin plane
 * @param {boolean} isVisible Visibility of origin plane
 */
Renderer.prototype.setOriginPlaneVisible = function (visible) {
    throw new Error('Abstract method not implemented');
};


/**
 * Renderer class for Three.js
 * @constructor
 * @extends {Renderer}
 */
function ThreeJsRenderer(options) {
    this.markerTransforms = {};
    Renderer.call(this, options);

    //temp matrix
    this.mainMarkerRootSolvedMatrixInv = new THREE.Matrix4();
}

//inherit from Renderer
ThreeJsRenderer.prototype = Object.create(Renderer.prototype);
ThreeJsRenderer.prototype.constructor = ThreeJsRenderer;

//register with factory
RendererFactory.register('threejs', ThreeJsRenderer);

//override methods
/**
 * Updates the renderer
 * @param  {number} dt time elapsed
 */
ThreeJsRenderer.prototype.update = function (dt) {

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
ThreeJsRenderer.prototype.showChildrenOfMarker = function (markerId, visible) {
    this.showChildren(this.markerTransforms[markerId], visible);
};
ThreeJsRenderer.prototype.showChildren = function (object3d, visible) {
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
                children[i].visible &= this.isLocalAxisVisible;
            }
        }
    }
};
ThreeJsRenderer.prototype.createTransformForMarker = function (markerId, markerSize) {
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
ThreeJsRenderer.prototype.loadForMarker = function (markerId, markerTransform, markerSize) {
    this.markerManager.loadForMarker(markerId, markerTransform, markerSize, this.isWireframeVisible);
};

//methods
/**
 * Initializes the camera projection matrix
 * @param  {Three.Matrix4} camProjMatrixArray Camera projection matrix
 */
ThreeJsRenderer.prototype.initCameraProjMatrix = function (camProjMatrixArray) {
    this.camera.projectionMatrix.setFromArray(camProjMatrixArray);
};
ThreeJsRenderer.prototype.setupBackgroundVideo = function () {
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
ThreeJsRenderer.prototype.setCurrSolvedMatrixValues = function (markerId, matrix) {
    this.markerTransforms[markerId].currSolvedMatrix.copy(matrix);
};
ThreeJsRenderer.prototype.setMarkerDetected = function (markerId, detected) {
    this.markerTransforms[markerId].detected = detected;
};
ThreeJsRenderer.prototype.updateSolvedScene = function (dt, mainMarkerId) {

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
            that.showChildren(that.markerTransforms[key], true);

            //call detected() on the GUI markers
            if (that.markerTransforms[key].guiMarker) {
                that.markerTransforms[key].guiMarker.detected(dt, that.markerTransforms[key].matrix);
            }
        } else {

            //no need to transform

            //hide the object
            that.showChildren(that.markerTransforms[key], false);

            //call hidden() on the GUI markers
            if (that.markerTransforms[key].guiMarker) {
                that.markerTransforms[key].guiMarker.hidden();
            }
        }
    });
};
/**
 * Sets visibility of origin plane
 * @param {boolean} isVisible Visibility of origin plane
 */
ThreeJsRenderer.prototype.setOriginPlaneVisible = function (visible) {
    this.originPlaneMeshIsVisible = visible;
};
/**
 * Sets visibility of wireframe
 * @param {boolean} isVisible Visibility of wireframe
 */
ThreeJsRenderer.prototype.setWireframeVisible = function (isVisible) {

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
ThreeJsRenderer.prototype.setLocalAxisVisible = function (isVisible) {
    this.isLocalAxisVisible = isVisible;
    var i, len;
    for (i = 0, len = this.localAxes.length; i < len; i++) {
        this.localAxes[i].visible = isVisible;
    }
};


//===================================
// SKARF
//===================================

/**
 * Class which handles different augmented reality libraries
 * @constructor
 */
function SkArF(options) {

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
    if (typeof options.rendererType === 'undefined') {
        throw new Error('rendererType not specified');
    }
    this.rendererType = options.rendererType;
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
    this.init();
}
SkArF.prototype.__create2dCanvas = function () {

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
SkArF.prototype.init = function () {

    //create a 2d canvas for copying data from tracking element
    this.__create2dCanvas();

    //create renderer instance
    this.renderer = RendererFactory.create(this.rendererType, {
                                               renderer: this.renderer,
                                               scene: this.scene,
                                               camera: this.camera,
                                               markersJsonFile: this.markersJsonFile
                                           });

    //create AR lib instance
    this.arLib = ArLibFactory.create(this.arLibType, {
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
 */
SkArF.prototype.update = function (dt) {
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
 * @param {string} type Type of callback e.g. 'render'
 * @param {function} callbackFn Callback function to call
 */
SkArF.prototype.addCallback = function (type, callbackFn) {
    //pass all callbacks to renderer for now
    //TODO: manage callbacks better
    this.renderer.addCallback(type, callbackFn);
};
/**
 * Returns true if the designated main marker has been detected
 * @return {bool} true if the designated main marker has been detected
 */
SkArF.prototype.mainMarkerDetected = function () {
    return this.arLib.mainMarkerHasEverBeenDetected;
};
/**
 * Inits camera projection matrix
 */
SkArF.prototype.initCameraProjMatrix = function () {
    if (this.arLib instanceof JsArToolKitArLib) {
        this.arLib.initCameraProjMatrix();
    }
};

