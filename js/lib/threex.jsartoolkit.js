/**
 * Wrapper to export JSARToolkit
 *
 * released under MIT license - Jerome Etienne - http://jetienne.mit-license.org
 * NOTE that JSARToolKit is under GPL
 *
 * - html5rock tutorial on jsartoolkit by Ilmari Heikkinen
 *   html5rocks.com/en/tutorials/webgl/jsartoolkit_webrtc/
 * - JSARToolKit repository by Ilmari Heikkinen too :)
 *   http://github.com/kig/JSARToolKit
*/

/**
 * @namespace
*/
var THREEx	= THREEx	|| {};

/**
 * 
*/
THREEx.JSARToolKit	= function(opts){
	// parse arguments
	opts			= opts || {};
	this._srcElement	= opts.srcElement	|| console.assert(false, "srcElement MUST be provided");
	this._callback		= opts.callback		|| console.assert(false, "callback MUST be provided");
	this._camera 		= opts.camera		|| console.assert(false, "camera MUST be provided");
	this._threshold		= opts.threshold !== undefined ? opts.threshold : 128;	
	this._debug		= opts.debug !== undefined ? opts.debug : false;
	this._canvasRasterW	= opts.canvasRasterW	|| this._srcElement.width;
	this._canvasRasterH	= opts.canvasRasterH	|| this._srcElement.height;
	this._maxAge		= opts.maxAge		|| 1;

	this._markers		= {};
	
	var canvasRaster	= document.createElement('canvas');
	this._canvasRaster	= canvasRaster;
	canvasRaster.width	= this._canvasRasterW;
	canvasRaster.height	= this._canvasRasterH;
	
	// enable the debug
	if( this._debug ){
		// to enable/disable debug output in jsartoolkit
		// FIXME this is a global... not even prefixed...
		DEBUG		= true;

		// apparently debug canvas is directly updated by jsartoolkit
		var debugCanvas		= document.createElement('canvas');
		debugCanvas.id		= 'debugCanvas';
		debugCanvas.width	= canvasRaster.width;
		debugCanvas.height	= canvasRaster.height;
		document.body.appendChild(debugCanvas);		
	}

	// Create a RGB raster object for the 2D canvas.
	// JSARToolKit uses raster objects to read image data.
	// Note that you need to set canvas.changed = true on every frame.
	var arRaster	= new NyARRgbRaster_Canvas2D(canvasRaster);
	// FLARParam is the thing used by FLARToolKit to set camera parameters.
	// Here we create a FLARParam for images with 320x240 pixel dimensions.
	var arParam	= new FLARParam(canvasRaster.width,canvasRaster.height);
	// The FLARMultiIdMarkerDetector is the actual detection engine for marker detection.
	// It detects multiple ID markers. ID markers are special markers that encode a number.
	// - 100 seems to be a zoom factor for the resulting matrix
	var arDetector	= new FLARMultiIdMarkerDetector(arParam, 100);
	// For tracking video set continue mode to true. In continue mode, the detector
	// tracks markers across multiple frames.
	arDetector.setContinueMode(true);
	this._arRaster	= arRaster;
	this._arDetector= arDetector;

	// Next we need to make the Three.js camera use the FLARParam matrix.
	// Copy the camera perspective matrix from the FLARParam to the WebGL library camera matrix.
	// The second and third parameters determine the zNear and zFar planes for the perspective matrix.
	var tmpGlMatCam	= new Float32Array(16);
	arParam.copyCameraMatrix(tmpGlMatCam, 10, 10000);
	this._copyMatrixGl2Threejs(tmpGlMatCam, this._camera.projectionMatrix);
	
	// Create a NyARTransMatResult object for getting the marker translation matrices.
	this._tmpArMat	= new NyARTransMatResult();
	
	this._tmpGlMat	= new Float32Array(16);
}

THREEx.JSARToolKit.prototype.canvasRaster	= function()
{
	return this._canvasRaster
}
/**
 * update to call at every rendering-loop iteration
*/
THREEx.JSARToolKit.prototype.update	= function()
{
	var canvasRaster= this._canvasRaster;
	var markers	= this._markers;
	var arRaster	= this._arRaster;
	var arDetector	= this._arDetector;
	var events	= [];

	var ctxRaster	= canvasRaster.getContext('2d');
	// copy srcElement into canvasRaster
	ctxRaster.drawImage(this._srcElement, 0,0, ctxRaster.canvas.width, ctxRaster.canvas.height);
	// warn JSARToolKit that the canvas changed
	canvasRaster.changed	= true;

	// Do marker detection by using the detector object on the raster object.
	// The threshold parameter determines the threshold value
	// for turning the video frame into a 1-bit black-and-white image.
	var nDetected	= arDetector.detectMarkerLite(arRaster, this._threshold);
	
	// Go through the detected markers and get their IDs and transformation matrices.
	for( var idx = 0; idx < nDetected; idx++ ){
		var markerId;
		// extract the markerId
		var id	= arDetector.getIdMarkerData(idx);
		if (id.packetLength > 4) {
			markerId = -1;
		}else{
			markerId = 0;
			for (var i = 0; i < id.packetLength; i++ ) {
				markerId = (markerId << 8) | id.getPacketData(i);
			}
		}
		// define the marker if needed
		var eventType		= markers[markerId] ? 'update' : 'create';
		markers[markerId]	= markers[markerId] || {};
		markers[markerId].age	= 0;
		// FIXME Object.asCopy is a dirty kludge - jsartoolkit is declaring this on global space 
		arDetector.getTransformMatrix(idx, this._tmpArMat);
		
		// generate the event
		var marker	= markers[markerId];
		var event	= {
			type	: eventType,
			markerId: markerId,
			matrix	: new THREE.Matrix4()
		};
		events.push(event);
		
		this._copyMatrixAr2Gl(this._tmpArMat, this._tmpGlMat);
		this._copyMatrixGl2Threejs(this._tmpGlMat, event.matrix);
	}
	// handle markers age - deleting old markers too
	// marker.age is the amount of iteration without detection
	Object.keys(markers).forEach(function(markerId){
		var marker = markers[markerId];
		marker.age++;
		if( marker.age > this._maxAge ){
			delete markers[markerId];
			events.push({
				type	: "delete",
				markerId: markerId
			});
		}
	}.bind(this));
	// notify all the events
	events.forEach(function(event){
		this._callback(event);	
	}.bind(this));
}

//////////////////////////////////////////////////////////////////////////////////
//		matrix conversion						//
//////////////////////////////////////////////////////////////////////////////////

/**
 * copy glmatrix to three.js matrix
*/
THREEx.JSARToolKit.prototype._copyMatrixGl2Threejs	 = function(m, tMat){
	// argument - sanity check
	console.assert( m instanceof Float32Array && m.length === 16 );
	console.assert( tMat instanceof THREE.Matrix4 );

	return tMat.set(
		m[0], m[4], m[8], m[12],
		m[1], m[5], m[9], m[13],
		m[2], m[6], m[10], m[14],
		m[3], m[7], m[11], m[15]
	);
};

/**
 * copy matrix from JSARToolKit to glmatrix
*/
THREEx.JSARToolKit.prototype._copyMatrixAr2Gl	 = function(mat, cm){
	// argument - sanity check
	console.assert( cm instanceof Float32Array && cm.length === 16 );
	console.assert( mat.className === 'NyARTransMatResult' );

	cm[0]	=  mat.m00;
	cm[1]	= -mat.m10;
	cm[2]	=  mat.m20;
	cm[3]	=  0;
	cm[4]	=  mat.m01;
	cm[5]	= -mat.m11;
	cm[6]	=  mat.m21;
	cm[7]	=  0;
	cm[8]	= -mat.m02;
	cm[9]	=  mat.m12;
	cm[10]	= -mat.m22;
	cm[11]	=  0;
	cm[12]	=  mat.m03;
	cm[13]	= -mat.m13;
	cm[14]	=  mat.m23;
	cm[15]	=  1;
};
