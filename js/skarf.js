/**
 * @fileOverview A JavaScript augmented reality framework for handling arbitrary augmented reality libraries and renderers
 * @author Skeel Lee <skeel@skeelogy.com>
 * @version 0.1.0
 *
 * @since 25 Jun 2013
 *
 * Usage:
 *
 * //create an AR framework (SkArF)
 * var skarf = new SkArF({...});
 *
 * //within the main loop, call:
 * skarf.update();
 *
 * If you wish to use your own AR library (e.g. JsArToolKitArLib):
 * 1) Subclass ArLib
 * 2) Register with factory: ArLibFactory.register('jsartoolkit', JsArToolKitArLib);
 * 3) Override the init() and loop() methods
 *
 * You can do similar things to create your own renderer.
 */

//===================================
// Model Loaders
//===================================

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

function ModelLoader() {
    this.loader = null;
}
ModelLoader.prototype.loadForMarker = function (markerId, markerTransform, overallScale, isWireframeVisible, modelManager) {
    throw new Error('Abstract method not implemented');
};
ModelLoader.prototype.transformAndParent = function (model, object, markerTransform, overallScale, modelManager) {

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

    //apply the transforms
    if (object) {
        object.applyMatrix(m);
        markerTransform.add(object);

        //store the material in modelManager
        modelManager.materials.push(object.material);

        //also set objects to cast shadows
        object.castShadow = true;
        object.receiveShadow = true;
    }

};

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
EmptyModelLoader.prototype.loadForMarker = function (model, markerId, markerTransform, overallScale, isWireframeVisible, modelManager) {
    //TODO: time how long it takes to load

    //bake transformations into vertices
    this.transformAndParent(model, null, markerTransform, overallScale, modelManager);

    console.log('Loaded empty transform for marker id ' + markerId);
};

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
JsonModelLoader.prototype.loadForMarker = function (model, markerId, markerTransform, overallScale, isWireframeVisible, modelManager) {
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
        that.transformAndParent(model, mesh, markerTransform, overallScale, modelManager);

        console.log('Loaded mesh ' + model.url + ' for marker id ' + markerId);
    });
};

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


function ObjModelLoader() {
    ModelLoader.call(this);
    if (typeof THREE.OBJMTLLoader === 'undefined') {
        throw new Error('THREE.OBJMTLLoader does not exist. Have you included OBJMTLLoader.js and MTLLoader.js?');
    }
    this.loader = new THREE.OBJMTLLoader();
    console.log('Created a ObjModelLoader');
}

//inherit from ModelLoader
ObjModelLoader.prototype = Object.create(ModelLoader.prototype);
ObjModelLoader.prototype.constructor = ObjModelLoader;

//register with factory
ModelLoaderFactory.register('obj', ObjModelLoader);

//override methods
ObjModelLoader.prototype.loadForMarker = function (model, markerId, markerTransform, overallScale, isWireframeVisible, modelManager) {
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
                    grandChild.material.wireframe = isWireframeVisible;
                }
            }
        }

        //transform and parent
        that.transformAndParent(model, object, markerTransform, overallScale, modelManager);

        console.log('Loaded mesh ' + model.url + ' for marker id ' + markerId);
    });

    var mtlFile = model.url.replace(/\.obj/g, '.mtl');  //assume mtl file has same base name as .obj
    this.loader.load(model.url, mtlFile);
};

//===================================
// Model Manager
//===================================

//TODO: this is Three.js specific, have to separate out into its own subclass

function ModelManager(modelsJsonFile) {
    this.modelsJsonFile = modelsJsonFile;

    this.modelData = null;
    this.loaders = {};

    this.materials = [];

    this.load();
}
ModelManager.prototype.load = function () {
    console.log('Loading models json file: ' + this.modelsJsonFile);

    //load the JSON file
    var that = this;
    $.ajax({
        url: this.modelsJsonFile,
        async: false
    }).done(function (data) {
        that.modelData = data;
        console.log('Loaded ' + that.modelsJsonFile);
        console.log('Main marker id: ' + that.modelData.mainMarkerId);
    }).error(function (xhr, textStatus, error) {
        throw new Error('error loading ' + this.modelsJsonFile + ': ' + error);
    });
};
ModelManager.prototype.loadForMarker = function (markerId, markerTransform, markerSize, isWireframeVisible) {
    var model = this.modelData.models[markerId];
    if (model) {
        var type = model.type;
        if (!this.loaders.hasOwnProperty(type)) {
            //create a loader using ModelLoaderFactory
            this.loaders[type] = ModelLoaderFactory.create(type);
        }

        this.loaders[type].loadForMarker(model, markerId, markerTransform, markerSize, isWireframeVisible, this);
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

    //temp matrix for calculations later
    this.tmpMat = new THREE.Matrix4();

    //variables to be assigned by skarf
    this.canvasElem = null;
    this.renderer = null;

    this.markers = {};  //this is just to keep track if a certain marker id has been seen
}
ArLib.prototype.init = function () {
    throw new Error('Abstract method not implemented');
};
ArLib.prototype.update = function () {
    throw new Error('Abstract method not implemented');
};

//create a class to handle JSARToolKit
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
    var camProjMatrixArray = new Float32Array(16);
    this.flarParam.copyCameraMatrix(camProjMatrixArray, 0.1, 10000);
    this.renderer.initCameraProjMatrix(camProjMatrixArray);
};
JsArToolKitArLib.prototype.update = function () {

    DEBUG = this.debug;

    //hide all marker roots first
    var keys = Object.keys(this.markers);
    var i, j;
    for (i = 0; i < keys.length; i++) {

        //hide marker
        this.renderer.showChildrenOfMarker(keys[i], false);

        //set detected to false for this marker
        this.renderer.setMarkerDetected(keys[i], false);
    }

    //hide ground plane regardless of the originPlaneMeshIsVisible flag
    this.renderer.originPlaneMesh.visible = false;

    // Do marker detection by using the detector object on the raster object.
    // The threshold parameter determines the threshold value
    // for turning the video frame into a 1-bit black-and-white image.
    //
    //NOTE: THE CANVAS MUST BE THE SAME SIZE AS THE RASTER
    //OTHERWISE WILL GET AN "Uncaught #<Object>" ERROR
    var markerCount = this.detector.detectMarkerLite(this.raster, this.threshold);

    // Go through the detected markers and get their IDs and transformation matrices.
    for (i = 0; i < markerCount; i++) {

        // Get the ID marker data for the current marker.
        // ID markers are special kind of markers that encode a number.
        // The bytes for the number are in the ID marker data.
        var id = this.detector.getIdMarkerData(i);


        // Read bytes from the id packet.
        var currId = -1;
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
            this.renderer.loadModelForMarker(currId, transform, this.markerSize);
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
    this.renderer.updateSolvedScene(this.mainMarkerId);
};

//create a class to handle js-aruco
function JsArucoArLib(options) {
    ArLib.call(this, options);
}

//inherit from ArLib
JsArucoArLib.prototype = Object.create(ArLib.prototype);
JsArucoArLib.prototype.constructor = JsArucoArLib;

//register with factory
ArLibFactory.register('jsaruco', JsArucoArLib);

//override methods
JsArucoArLib.prototype.init = function () {
    this.detector = new AR.Detector();

    //NOTE: the second parameter is suppose to be canvasWidth (from the js-aruco example).
    //However, it cannot work when I change the aspect ratio of the tracking canvas.
    //It seems as though the tracking canvas must be 4:3, so I'm doing some compensation here to allow any aspect ratio.
    this.posit = new POS.Posit(this.markerSize, this.canvasElem.height * 4.0 / 3.0);

    this.context = this.canvasElem.getContext('2d');
};
JsArucoArLib.prototype.update = function () {
    var imageData = this.context.getImageData(0, 0, this.canvasElem.width, this.canvasElem.height);
    var markers = this.detector.detect(imageData);
    if (this.debug) {
        this.__drawCorners(markers);
        this.__drawId(markers);
    }

    //update scene
    this.__updateScenes(markers);
};
JsArucoArLib.prototype.__updateScenes = function (markers) {
    var corners, corner, pose, i, markerId;

    //hide all marker roots first
    var keys = Object.keys(this.markers);
    for (i = 0; i < keys.length; i++) {

        //hide marker
        this.renderer.showChildrenOfMarker(keys[i], false);

        //set detected to false for this marker
        this.renderer.setMarkerDetected(keys[i], false);
    }

    //hide ground plane regardless of the originPlaneMeshIsVisible flag
    this.renderer.originPlaneMesh.visible = false;

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
            this.renderer.loadModelForMarker(markerId, transform, this.markerSize);
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
    this.renderer.updateSolvedScene(this.mainMarkerId);
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

function Renderer(options) {
    if (typeof options.rendererContainerElem === 'undefined') {
        throw new Error('rendererContainerElem not specified');
    }
    this.rendererContainerElem = options.rendererContainerElem;

    if (typeof options.rendererCanvasElemWidth === 'undefined') {
        throw new Error('rendererCanvasElemWidth not specified');
    }
    this.rendererCanvasElemWidth = options.rendererCanvasElemWidth;

    if (typeof options.rendererCanvasElemHeight === 'undefined') {
        throw new Error('rendererCanvasElemHeight not specified');
    }
    this.rendererCanvasElemHeight = options.rendererCanvasElemHeight;

    if (typeof options.modelsJsonFile === 'undefined') {
        throw new Error('modelsJsonFile not specified');
    }
    this.modelsJsonFile = options.modelsJsonFile;

    this.useDefaultLights = (typeof options.useDefaultLights === 'undefined') ? true : options.useDefaultLights;

    this.isWireframeVisible = (typeof options.displayWireframe === 'undefined') ? false : options.displayWireframe;
    this.isLocalAxisVisible = (typeof options.displayLocalAxis === 'undefined') ? false : options.displayLocalAxis;

    this.modelManager = new ModelManager(this.modelsJsonFile);
    this.localAxes = [];

    //variables to be assigned by skarf
    this.arLib = null;
    this.backgroundCanvasElem = null;
}
Renderer.prototype.init = function () {
    this.setupCamera();
    this.setupScene();
    this.createOriginPlane();
    if (this.useDefaultLights) {
        this.setupLights();
    }
    this.setupRenderer();
    this.setupBackgroundVideo();
};
Renderer.prototype.getMainMarkerId = function () {
    return this.modelManager.modelData.mainMarkerId;
};
Renderer.prototype.update = function () {
    throw new Error('Abstract method not implemented');
};
Renderer.prototype.setupCamera = function () {
    throw new Error('Abstract method not implemented');
};
Renderer.prototype.setupScene = function () {
    throw new Error('Abstract method not implemented');
};
Renderer.prototype.createOriginPlane = function () {
    throw new Error('Abstract method not implemented');
};
Renderer.prototype.setupLights = function () {
    throw new Error('Abstract method not implemented');
};
Renderer.prototype.setupRenderer = function () {
    throw new Error('Abstract method not implemented');
};
Renderer.prototype.setupBackgroundVideo = function () {
    throw new Error('Abstract method not implemented');
};
Renderer.prototype.createTransformForMarker = function (markerId, markerSize) {
    throw new Error('Abstract method not implemented');
};
Renderer.prototype.getAllMaterials = function (transform) {
    throw new Error('Abstract method not implemented');
};
Renderer.prototype.getAllLocalAxes = function (transform) {
    throw new Error('Abstract method not implemented');
};
Renderer.prototype.setWireframeVisible = function (isVisible) {
    throw new Error('Abstract method not implemented');
};
Renderer.prototype.setLocalAxisVisible = function (isVisible) {
    throw new Error('Abstract method not implemented');
};
Renderer.prototype.setOriginPlaneVisible = function (visible) {
    throw new Error('Abstract method not implemented');
};


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
ThreeJsRenderer.prototype.update = function () {
    this.videoTex.needsUpdate = true;
    this.renderer.autoClear = false;
    this.renderer.clear();
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
ThreeJsRenderer.prototype.loadModelForMarker = function (markerId, markerTransform, markerSize) {
    this.modelManager.loadForMarker(markerId, markerTransform, markerSize, this.isWireframeVisible);
};

//methods
ThreeJsRenderer.prototype.initCameraProjMatrix = function (camProjMatrixArray) {
    this.camera.projectionMatrix.setFromArray(camProjMatrixArray);
};
ThreeJsRenderer.prototype.setupCamera = function () {
    var verticalFov = this.arLib.verticalFov || 30;
    this.camera = new THREE.PerspectiveCamera(verticalFov, this.rendererCanvasElemWidth / this.rendererCanvasElemHeight, 0.1, 10000);
    this.camera.matrixAutoUpdate = false;
};
ThreeJsRenderer.prototype.setupScene = function () {
    this.scene = new THREE.Scene();
};
ThreeJsRenderer.prototype.createOriginPlane = function () {
    var originPlaneGeom = new THREE.PlaneGeometry(this.arLib.markerSize * 3, this.arLib.markerSize * 3, 1, 1);
    originPlaneGeom.applyMatrix(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
    var originPlaneMaterial = new THREE.MeshPhongMaterial({
        color: 0x99ff66,
        side: THREE.DoubleSide,
        wireframe: false
    });
    this.originPlaneMesh = new THREE.Mesh(originPlaneGeom, originPlaneMaterial);
    this.originPlaneMesh.castShadow = true;
    this.originPlaneMesh.receiveShadow = true;
    this.scene.add(this.originPlaneMesh);
    this.originPlaneMeshIsVisible = false;
};
ThreeJsRenderer.prototype.setupLights = function () {

    this.scene.add(new THREE.AmbientLight(0x111111));

    var keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
    keyLight.position.set(-50, 75, 75);
    keyLight.target.position.set(0, 0, 0);
    keyLight.castShadow = true;
    keyLight.shadowCameraNear = 60;
    keyLight.shadowCameraFar = 200;
    keyLight.shadowCameraRight = 150;
    keyLight.shadowCameraLeft = -150;
    keyLight.shadowCameraTop = 150;
    keyLight.shadowCameraBottom = -150;
    // keyLight.shadowCameraVisible = true;
    keyLight.shadowBias = 0.0001;
    keyLight.shadowDarkness = 0.5;
    keyLight.shadowMapWidth = 1024;
    keyLight.shadowMapHeight = 1024;
    this.scene.add(keyLight);

    var fillLight = new THREE.DirectionalLight(0xffffff, 0.7);
    fillLight.position.set(25, 75, 75);
    fillLight.target.position.set(0, 0, 0);
    this.scene.add(fillLight);
};
ThreeJsRenderer.prototype.setupRenderer = function () {
    this.renderer = new THREE.WebGLRenderer({
        antialias: true
    });
    this.renderer.setSize(this.rendererCanvasElemWidth, this.rendererCanvasElemHeight);
    this.renderer.shadowMapEnabled = true;
    this.renderer.shadowMapType = THREE.PCFShadowMap;
    this.renderer.shadowMapSoft = true;
    this.rendererContainerElem.append(this.renderer.domElement);
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
ThreeJsRenderer.prototype.updateSolvedScene = function (mainMarkerId) {
    if (this.markerTransforms[mainMarkerId] && this.markerTransforms[mainMarkerId].detected) {

        //move the camera instead of the marker root
        this.camera.matrix.copy(this.arLib.compensationMatrix);  //compensate coordinate system and up vector differences
        this.camera.matrix.multiply(this.mainMarkerRootSolvedMatrixInv.getInverse(this.markerTransforms[mainMarkerId].currSolvedMatrix));  //multiply inverse of main marker's matrix will force main marker to be at origin and the camera to transform around this world space
        this.camera.matrixWorldNeedsUpdate = true;

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
            }
        });

        //also show the ground plane based on the originPlaneMeshIsVisible flag
        this.originPlaneMesh.visible = this.originPlaneMeshIsVisible;
    }
};
ThreeJsRenderer.prototype.setOriginPlaneVisible = function (visible) {
    this.originPlaneMeshIsVisible = visible;
};
ThreeJsRenderer.prototype.setWireframeVisible = function (isVisible) {

    this.isWireframeVisible = isVisible;

    var i, j, leni, lenj, m;
    for (i = 0, leni = this.modelManager.materials.length; i < leni; i++) {
        m = this.modelManager.materials[i];
        if (m instanceof THREE.MeshFaceMaterial) {
            for (j = 0, lenj = m.materials.length; j < lenj; j++) {
                m.materials[j].wireframe = isVisible;
            }
        } else {
            m.wireframe = isVisible;
        }
    }

    //also set the wireframe mode for the ground plane
    this.originPlaneMesh.material.wireframe = isVisible;
};
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
    this.rendererContainerElem = options.rendererContainerElem;
    this.rendererCanvasElemWidth = options.rendererCanvasElemWidth || 640;
    this.rendererCanvasElemHeight = options.rendererCanvasElemHeight || 480;
    if (typeof options.modelsJsonFile === 'undefined') {
        throw new Error('modelsJsonFile not specified');
    }
    this.modelsJsonFile = options.modelsJsonFile;

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
                                               rendererContainerElem: this.rendererContainerElem,
                                               rendererCanvasElemWidth: this.rendererCanvasElemWidth,
                                               rendererCanvasElemHeight: this.rendererCanvasElemHeight,
                                               modelsJsonFile: this.modelsJsonFile
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
SkArF.prototype.update = function () {
    //draw the video/img to canvas
    // if (this.videoElem.readyState === this.videoElem.HAVE_ENOUGH_DATA) {
        this.context.drawImage(this.trackingElem, 0, 0, this.canvasElem.width, this.canvasElem.height);
        this.canvasElem.changed = true;

        //call updates
        this.arLib.update();
        this.renderer.update();
    // }
};