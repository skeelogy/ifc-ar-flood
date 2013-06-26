/*===================================
skarf.js
author: Skeel Lee
contact: skeel@skeelogy.com
since: 25 Jun 2013
A Javascript augmented reality framework for handling arbitrary augmented reality libraries and renderers

Usage:

//get canvas element e.g.
var canvas = document.getElementById('myCanvas');

//get video element
var video = document.getElementById('myVideo');

//create an AR library
var jsArToolKitArLib = new JsArToolKitArLib...

//create a renderer
var threeJsRenderer = new ThreeJsRenderer...

//create an AR framework
skarf = new SkArF({
	canvasElem: canvas,
	videoElem: video,
	arLib: jsArToolKitArLib,
	renderer: threeJsRenderer
});

//finally, within the main loop, call:
skar.update();

If you wish to use your own AR library:
1) Subclass ArLib
2) Override the init() and loop() methods

You can do similar things to create your own renderer.
===================================*/

function SkArF(options)
{
	if (!options.canvasElem) throw new Error('canvasElem not specified');
	this.canvasElem = options.canvasElem;
	
	if (!options.videoElem) throw new Error('videoElem not specified');
	this.videoElem = options.videoElem;
	
	if (!options.arLib) throw new Error('arLib not specified');
	this.arLib = options.arLib;
	
	if (!options.renderer) throw new Error('renderer not specified');
	this.renderer = options.renderer;
	
	this.init();
}
SkArF.prototype.init = function()
{
	//assign a pointer of itself to each other
	this.arLib.renderer = this.renderer;
	this.renderer.arLib = this.arLib;
}
SkArF.prototype.update = function()
{
	//draw the video to canvas
	if (this.videoElem.readyState === this.videoElem.HAVE_ENOUGH_DATA)
	{
		this.canvasElem.getContext('2d').drawImage(this.videoElem, 0, 0, this.canvasElem.width, this.canvasElem.height);
		this.canvasElem.changed = true;
		
		//call pre-updates
		this.arLib.preUpdate();
		this.renderer.preUpdate();
		
		//call updates
		this.arLib.update();
		this.renderer.update();
		
		//call post-updates
		this.arLib.postUpdate();
		this.renderer.postUpdate();
	}
}

//===================================
// AR Libraries
//===================================

function ArLib(options)
{
	if (!options.canvasElem) throw new Error('canvasElem not specified');
	this.canvasElem = options.canvasElem;
	
	if (!options.canvasWidth) throw new Error('canvasWidth not specified');
	this.canvasWidth = options.canvasWidth;
	
	if (!options.canvasHeight) throw new Error('canvasHeight not specified');
	this.canvasHeight = options.canvasHeight;
}
ArLib.prototype.init = function()
{
	throw new Error('Abstract method not implemented');
}
ArLib.prototype.preInit = function(){}
ArLib.prototype.postInit = function(){}
ArLib.prototype.update = function()
{
	throw new Error('Abstract method not implemented');
}
ArLib.prototype.preUpdate = function(){}
ArLib.prototype.postUpdate = function(){}

//create a class to handle JSARToolKit
function JsArToolKitArLib(options)
{
	ArLib.call(this, options);
	
	this.markerWidth = options.markerWidth || 120;
	this.threshold = options.threshold || 128;
	this.debug = (typeof(options.debug)==='undefined') ? false : options.debug;
	
	this.markers = {};

	//store some temp variables
	this.resultMat = new NyARTransMatResult();
	this.tmp = {};
	
	this.init();
}

//inherit from ArLib
JsArToolKitArLib.prototype = Object.create(ArLib.prototype);
JsArToolKitArLib.prototype.constructor = JsArToolKitArLib;

//override methods
JsArToolKitArLib.prototype.init = function()
{
	//required by JSARToolKit to show the debug canvas
	DEBUG = this.debug;

	// Create a RGB raster object for the 2D canvas.
	// JSARToolKit uses raster objects to read image data.
	// Note that you need to set canvas.changed = true on every frame.
	this.raster = new NyARRgbRaster_Canvas2D(this.canvasElem);

	// FLARParam is the thing used by FLARToolKit to set camera parameters.
	this.flarParam = new FLARParam(this.canvasWidth, this.canvasHeight);

	// The FLARMultiIdMarkerDetector is the actual detection engine for marker detection.
	// It detects multiple ID markers. ID markers are special markers that encode a number.
	this.detector = new FLARMultiIdMarkerDetector(this.flarParam, this.markerWidth);

	// For tracking video set continue mode to true. In continue mode, the detector
	// tracks markers across multiple frames.
	this.detector.setContinueMode(true);
}
JsArToolKitArLib.prototype.update = function()
{
	// Do marker detection by using the detector object on the raster object.
	// The threshold parameter determines the threshold value
	// for turning the video frame into a 1-bit black-and-white image.
	//
	//NOTE: THE CANVAS MUST BE THE SAME SIZE AS THE RASTER
	//OTHERWISE WILL GET AN "Uncaught #<Object>" ERROR
	var markerCount = this.detector.detectMarkerLite(this.raster, this.threshold);
	
	// Go through the detected markers and get their IDs and transformation matrices.
	for (var i=0; i<markerCount; i++)
	{
	
		// Get the ID marker data for the current marker.
		// ID markers are special kind of markers that encode a number.
		// The bytes for the number are in the ID marker data.
		var id = this.detector.getIdMarkerData(i);


		// Read bytes from the id packet.
		var currId = -1;
		// This code handles only 32-bit numbers or shorter.
		if (id.packetLength <= 4) {
			currId = 0;
			for (var j = 0; j < id.packetLength; j++) {
			  currId = (currId << 8) | id.getPacketData(j);
			}
		}


		// If this is a new id, let's start tracking it.
		if (this.markers[currId] == null) {
		
			//create new object for the marker
			this.markers[currId] = {};
			
			//create a transform for this marker
			this.renderer.createTransformForMarker(currId);
		}
	
		// Get the transformation matrix for the detected marker.
		this.detector.getTransformMatrix(i, this.resultMat);

		// Copy the marker matrix to the tmp matrix.
		copyMarkerMatrix(this.resultMat, this.tmp);

		// Copy the marker matrix over to your marker root object.
		this.renderer.setMarkerTransform(currId, this.tmp);
	}
}

//===================================
// Renderers
//===================================

function Renderer(options)
{
	if (!options.rendererContainerElem) throw new Error('rendererContainerElem not specified');
	this.rendererContainerElem = options.rendererContainerElem;
	
	if (!options.rendererCanvasWidth) throw new Error('rendererCanvasWidth not specified');
	this.rendererCanvasWidth = options.rendererCanvasWidth;
	
	if (!options.rendererCanvasHeight) throw new Error('rendererCanvasHeight not specified');
	this.rendererCanvasHeight = options.rendererCanvasHeight;
	
	if (!options.streamCanvasElem) throw new Error('streamCanvasElem not specified');
	this.streamCanvasElem = options.streamCanvasElem;
}
Renderer.prototype.init = function()
{
	throw new Error('Abstract method not implemented');
}
Renderer.prototype.preInit = function(){}
Renderer.prototype.postInit = function(){}
Renderer.prototype.update = function()
{
	throw new Error('Abstract method not implemented');
}
Renderer.prototype.preUpdate = function(){}
Renderer.prototype.postUpdate = function(){}
Renderer.prototype.createTransformForMarker = function(markerId)
{
	throw new Error('Abstract method not implemented');
}
Renderer.prototype.setMarkerTransform = function(markerId, transformMatrix)
{
	throw new Error('Abstract method not implemented');
}


function ThreeJsRenderer(options)
{
	Renderer.call(this, options);

	if (!options.camProjMatrixArray) throw new Error('camProjMatrixArray not specified');
	this.camProjMatrixArray = options.camProjMatrixArray;
	
	this.markerTransforms = {};
	this.emptyFloatArray = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
	
	this.init();
}

//inherit from Renderer
ThreeJsRenderer.prototype = Object.create(Renderer.prototype);
ThreeJsRenderer.prototype.constructor = ThreeJsRenderer;

//override methods
ThreeJsRenderer.prototype.init = function()
{
	this.setupCamera();
	this.setupScene();
	this.setupRenderer();
	this.setupBackgroundVideo();
}
ThreeJsRenderer.prototype.update = function()
{
	this.videoTex.needsUpdate = true;
	this.renderer.autoClear = false;
	this.renderer.clear();
	this.renderer.render(this.videoScene, this.videoCam);
	this.renderer.render(this.scene, this.camera);
}
ThreeJsRenderer.prototype.preUpdate = function()
{
	//move all marker roots to origin so that they will disappear when not tracked
	//FIXME: not sure why I need the temp variables below
	var t = this.markerTransforms;
	var e = this.emptyFloatArray;
	Object.keys(this.markerTransforms).forEach(function (key){
		t[key].matrix.setFromArray(e);
		t[key].matrixWorldNeedsUpdate = true;
	});
}
ThreeJsRenderer.prototype.createTransformForMarker = function(markerId)
{
	//create a new Three.js object as marker root
	var markerTransform = new THREE.Object3D();
	markerTransform.matrixAutoUpdate = false;
	this.markerTransforms[markerId] = markerTransform;

	//TODO: expose this part here as another method to be overriden
	// Add the marker models and suchlike into your marker root object.
	var cube = new THREE.Mesh(
	  new THREE.CubeGeometry(120,120,120),
	  new THREE.MeshNormalMaterial({color: 0xff00ff, side: THREE.BackSide, wireframe: false})
	);
	cube.position.z = -60;
	markerTransform.add(cube);
	
	// Add the marker root to your scene.
	this.scene.add(markerTransform);
}
ThreeJsRenderer.prototype.setMarkerTransform = function(markerId, transformMatrix)
{
	this.markerTransforms[markerId].matrix.setFromArray(transformMatrix);
	this.markerTransforms[markerId].matrixWorldNeedsUpdate = true;
}

//methods
ThreeJsRenderer.prototype.setupCamera = function()
{
	this.camera = new THREE.Camera();
	this.camera.projectionMatrix.setFromArray(this.camProjMatrixArray);
}
ThreeJsRenderer.prototype.setupScene = function()
{
	this.scene = new THREE.Scene();
}
ThreeJsRenderer.prototype.setupRenderer = function()
{
	this.renderer = this.createRenderer();
	this.renderer.setSize(this.rendererCanvasWidth, this.rendererCanvasHeight);
	this.rendererContainerElem.append(this.renderer.domElement);
}
ThreeJsRenderer.prototype.createRenderer = function()  //meant for overriding
{
	return new THREE.WebGLRenderer({
		antialias: true
	});
}
ThreeJsRenderer.prototype.setupBackgroundVideo = function()
{
	//NOTE: must use <canvas> as the texture, not <video>, otherwise there will be a 1-frame lag
	this.videoTex = new THREE.Texture(this.streamCanvasElem);
	this.videoPlane = new THREE.PlaneGeometry(2, 2, 0);
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
}

//===================================
// Helpers
//===================================

// I'm going to use a glMatrix-style matrix as an intermediary.
// So the first step is to create a function to convert a glMatrix matrix into a Three.js Matrix4.
THREE.Matrix4.prototype.setFromArray = function(m) {
	return this.set(
		m[0], m[4], m[8], m[12],
		m[1], m[5], m[9], m[13],
		m[2], m[6], m[10], m[14],
		m[3], m[7], m[11], m[15]
	);
};

function copyMarkerMatrix(arMat, glMat)
{
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