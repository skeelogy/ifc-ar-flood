/**
 * @fileOverview A JavaScript/GLSL sculpting script for sculpting Three.js meshes
 * @author Skeel Lee <skeel@skeelogy.com>
 * @version 1.0.0
 */

/**
 * Creates a GpuSkulpt instance that manages sculpting
 * @constructor
 */
function GpuSkulpt(options) {

    if (typeof options.mesh === 'undefined') {
        throw new Error('mesh not specified');
    }
    this.mesh = options.mesh;
    if (typeof options.renderer === 'undefined') {
        throw new Error('renderer not specified');
    }
    this.renderer = options.renderer;
    if (typeof options.size === 'undefined') {
        throw new Error('size not specified');
    }
    this.size = options.size;
    this.halfSize = this.size / 2.0;
    if (typeof options.res === 'undefined') {
        throw new Error('res not specified');
    }
    this.res = options.res;
    this.proxyRes = options.proxyRes || this.res;

    this.actualToProxyRatio = this.res / this.proxyRes;
    this.gridSize = this.size / this.res;
    this.texelSize = 1.0 / this.res;

    this.imageProcessedData = new Float32Array(4 * this.res * this.res);
    this.imageDataTexture = new THREE.DataTexture(null, this.res, this.res, THREE.RGBAFormat, THREE.FloatType);

    this.isSculpting = false;
    this.sculptUvPos = new THREE.Vector2();

    this.cursorHoverColor = new THREE.Vector3(0.4, 0.4, 0.4);
    this.cursorAddColor = new THREE.Vector3(0.3, 0.5, 0.1);
    this.cursorRemoveColor = new THREE.Vector3(0.5, 0.2, 0.1);

    this.shouldClear = false;

    this.linearFloatRGBParams = {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
        format: THREE.RGBFormat,
        stencilBuffer: false,
        depthBuffer: false,
        type: THREE.FloatType
    };

    this.nearestFloatRGBAParams = {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
        format: THREE.RGBAFormat,
        stencilBuffer: false,
        depthBuffer: false,
        type: THREE.FloatType
    };

    this.pixelByteData = new Uint8Array(this.res * this.res * 4);
    this.proxyPixelByteData = new Uint8Array(this.proxyRes * this.proxyRes * 4);

    this.callbacks = {};

    this.init();
}
GpuSkulpt.prototype.init = function () {
    this.__checkExtensions();
    this.__setupShaders();
    this.__setupRttScene();
    this.__setupVtf();
};
GpuSkulpt.prototype.__checkExtensions = function (renderer) {
    var context = this.renderer.context;
    if (!context.getExtension('OES_texture_float_linear')) {
        throw new Error('Extension not available: OES_texture_float_linear');
    }
    if (!context.getParameter(context.MAX_VERTEX_TEXTURE_IMAGE_UNITS)) {
        throw new Error('Vertex textures not supported on your graphics card');
    }
};
GpuSkulpt.prototype.__setupShaders = function () {

    THREE.ShaderManager.addShader('/glsl/passUv.vert');

    THREE.ShaderManager.addShader('/glsl/skulpt.frag');
    this.skulptMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uBaseTexture: { type: 't', value: null },
            uSculptTexture1: { type: 't', value: null },
            uTexelSize: { type: 'v2', value: new THREE.Vector2(this.texelSize, this.texelSize) },
            uTexelWorldSize: { type: 'v2', value: new THREE.Vector2(this.size / this.res, this.size / this.res) },
            uIsSculpting: { type: 'i', value: 0 },
            uSculptType: { type: 'i', value: 0 },
            uSculptPos: { type: 'v2', value: new THREE.Vector2() },
            uSculptAmount: { type: 'f', value: 0.05 },
            uSculptRadius: { type: 'f', value: 0.0 }
        },
        vertexShader: THREE.ShaderManager.getShaderContents('/glsl/passUv.vert'),
        fragmentShader: THREE.ShaderManager.getShaderContents('/glsl/skulpt.frag')
    });

    THREE.ShaderManager.addShader('/glsl/combineTextures.frag');
    this.combineTexturesMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTexture1: { type: 't', value: null },
            uTexture2: { type: 't', value: null }
        },
        vertexShader: THREE.ShaderManager.getShaderContents('/glsl/passUv.vert'),
        fragmentShader: THREE.ShaderManager.getShaderContents('/glsl/combineTextures.frag')
    });

    THREE.ShaderManager.addShader('/glsl/setColor.frag');
    this.clearMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uColor: { type: 'v4', value: new THREE.Vector4() }
        },
        vertexShader: THREE.ShaderManager.getShaderContents('/glsl/passUv.vert'),
        fragmentShader: THREE.ShaderManager.getShaderContents('/glsl/setColor.frag')
    });

    THREE.ShaderManager.addShader('/glsl/encodeFloat.frag');
    this.rttEncodeFloatMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTexture: { type: 't', value: null },
            uChannelMask: { type: 'v4', value: new THREE.Vector4() }
        },
        vertexShader: THREE.ShaderManager.getShaderContents('/glsl/passUv.vert'),
        fragmentShader: THREE.ShaderManager.getShaderContents('/glsl/encodeFloat.frag')
    });

    THREE.ShaderManager.addShader('/glsl/scaleAndFlipV.frag');
    this.rttProxyMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTexture: { type: 't', value: null },
            uScale: { type: 'f', value: 0 }
        },
        vertexShader: THREE.ShaderManager.getShaderContents('/glsl/passUv.vert'),
        fragmentShader: THREE.ShaderManager.getShaderContents('/glsl/scaleAndFlipV.frag')
    });

    this.channelVectors = {
        'r': new THREE.Vector4(1, 0, 0, 0),
        'g': new THREE.Vector4(0, 1, 0, 0),
        'b': new THREE.Vector4(0, 0, 1, 0),
        'a': new THREE.Vector4(0, 0, 0, 1)
    };
};
//Sets up the render-to-texture scene (2 render targets for accumulative feedback)
GpuSkulpt.prototype.__setupRttScene = function () {

    //create a RTT scene
    this.rttScene = new THREE.Scene();

    //create an orthographic RTT camera
    var far = 10000;
    var near = -far;
    this.rttCamera = new THREE.OrthographicCamera(-this.halfSize, this.halfSize, this.halfSize, -this.halfSize, near, far);

    //create a quad which we will use to invoke the shaders
    this.rttQuadGeom = new THREE.PlaneGeometry(this.size, this.size);
    this.rttQuadMesh = new THREE.Mesh(this.rttQuadGeom, this.skulptMaterial);
    this.rttScene.add(this.rttQuadMesh);

    //create RTT render targets (we need two to do feedback)
    this.rttRenderTarget1 = new THREE.WebGLRenderTarget(this.res, this.res, this.linearFloatRGBParams);
    this.rttRenderTarget1.generateMipmaps = false;
    this.rttRenderTarget2 = this.rttRenderTarget1.clone();

    //create a RTT render target for storing the combine results of all layers
    this.rttCombinedLayer = this.rttRenderTarget1.clone();

    //create RTT render target for storing proxy terrain data
    this.rttProxyRenderTarget = new THREE.WebGLRenderTarget(this.proxyRes, this.proxyRes, this.linearFloatRGBParams);

    //create another RTT render target encoding float to 4-byte data
    this.rttFloatEncoderRenderTarget = new THREE.WebGLRenderTarget(this.res, this.res, this.nearestFloatRGBAParams);
    this.rttFloatEncoderRenderTarget.generateMipmaps = false;
};
//Sets up the vertex-texture-fetch for the given mesh
GpuSkulpt.prototype.__setupVtf = function () {
    this.mesh.material = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.merge([
            THREE.UniformsLib['lights'],
            THREE.UniformsLib['shadowmap'],
            {
                uTexture: { type: 't', value: null },
                uTexelSize: { type: 'v2', value: new THREE.Vector2(1.0 / this.res, 1.0 / this.res) },
                uTexelWorldSize: { type: 'v2', value: new THREE.Vector2(this.gridSize, this.gridSize) },
                uHeightMultiplier: { type: 'f', value: 1.0 },
                uBaseColor: { type: 'v3', value: new THREE.Vector3(0.6, 0.8, 0.0) },
                uShowCursor: { type: 'i', value: 0 },
                uCursorPos: { type: 'v2', value: new THREE.Vector2() },
                uCursorRadius: { type: 'f', value: 0.0 },
                uCursorColor: { type: 'v3', value: new THREE.Vector3() }
            }
        ]),
        vertexShader: THREE.ShaderManager.getShaderContents('heightmapVS'),
        fragmentShader: THREE.ShaderManager.getShaderContents('lambertCursorFS'),
        lights: true
    });
};
/**
 * Update
 */
GpuSkulpt.prototype.update = function () {

    //have to set flags from other places and then do all steps at once during update

    //clear sculpts if necessary
    if (this.shouldClear) {
        this.rttQuadMesh.material = this.clearMaterial;
        this.clearMaterial.uniforms['uColor'].value.set(0.0, 0.0, 0.0, 0.0);
        this.renderer.render(this.rttScene, this.rttCamera, this.rttRenderTarget1, false);
        this.renderer.render(this.rttScene, this.rttCamera, this.rttRenderTarget2, false);
        this.shouldClear = false;
        this.updateCombinedLayers = true;
    }

    //do the main sculpting
    if (this.isSculpting) {
        this.rttQuadMesh.material = this.skulptMaterial;
        this.skulptMaterial.uniforms['uBaseTexture'].value = this.imageDataTexture;
        this.skulptMaterial.uniforms['uSculptTexture1'].value = this.rttRenderTarget2;
        this.skulptMaterial.uniforms['uIsSculpting'].value = this.isSculpting;
        this.skulptMaterial.uniforms['uSculptPos'].value.copy(this.sculptUvPos);
        this.renderer.render(this.rttScene, this.rttCamera, this.rttRenderTarget1, false);
        this.swapRenderTargets();
        this.isSculpting = false;
        this.updateCombinedLayers = true;
    }

    //combine layers into one
    if (this.updateCombinedLayers) {  //this can be triggered somewhere else without sculpting

        this.rttQuadMesh.material = this.combineTexturesMaterial;
        this.combineTexturesMaterial.uniforms['uTexture1'].value = this.imageDataTexture;
        this.combineTexturesMaterial.uniforms['uTexture2'].value = this.rttRenderTarget2;
        this.renderer.render(this.rttScene, this.rttCamera, this.rttCombinedLayer, false);
        this.updateCombinedLayers = false;

        //need to rebind rttCombinedLayer to uTexture
        this.mesh.material.uniforms['uTexture'].value = this.rttCombinedLayer;

        //check for the callback of type 'update'
        if (this.callbacks.hasOwnProperty('update')) {
            var renderCallbacks = this.callbacks['update'];
            var i, len;
            for (i = 0, len = renderCallbacks.length; i < len; i++) {
                renderCallbacks[i]();
            }
        }
    }
};
GpuSkulpt.prototype.swapRenderTargets = function () {
    var temp = this.rttRenderTarget1;
    this.rttRenderTarget1 = this.rttRenderTarget2;
    this.rttRenderTarget2 = temp;
    // this.skulptMaterial.uniforms['uSculptTexture1'].value = this.rttRenderTarget2;
};
/**
 * Sets brush size
 * @param {number} size Brush size
 */
GpuSkulpt.prototype.setBrushSize = function (size) {
    var normSize = size / (this.size * 2.0);
    this.skulptMaterial.uniforms['uSculptRadius'].value = normSize;
    this.mesh.material.uniforms['uCursorRadius'].value = normSize;
};
/**
 * Sets brush amount
 * @param {number} amount Brush amount
 */
GpuSkulpt.prototype.setBrushAmount = function (amount) {
    this.skulptMaterial.uniforms['uSculptAmount'].value = amount;
};
/**
 * Loads terrain heights from image data
 * @param  {array} data Image data
 * @param  {number} amount Height multiplier
 * @param  {boolean} midGreyIsLowest Whether mid grey is considered the lowest part of the image
 */
GpuSkulpt.prototype.loadFromImageData = function (data, amount, midGreyIsLowest) {

    //convert data from Uint8ClampedArray to Float32Array so that DataTexture can use
    var normalizedHeight;
    var min = 99999;
    var i, len;
    for (i = 0, len = this.imageProcessedData.length; i < len; i++) {
        if (midGreyIsLowest) {
            normalizedHeight = Math.abs(data[i] / 255.0 - 0.5);
        } else {
            normalizedHeight = data[i] / 255.0;
        }
        this.imageProcessedData[i] = normalizedHeight * amount;

        //store min
        if (this.imageProcessedData[i] < min) {
            min = this.imageProcessedData[i];
        }
    }

    //shift down so that min is at 0
    for (i = 0, len = this.imageProcessedData.length; i < len; i++) {
        this.imageProcessedData[i] -= min;
    }

    //assign data to DataTexture
    this.imageDataTexture.image.data = this.imageProcessedData;
    this.imageDataTexture.needsUpdate = true;
    this.skulptMaterial.uniforms['uBaseTexture'].value = this.imageDataTexture;
    this.combineTexturesMaterial.uniforms['uTexture1'].value = this.imageDataTexture;
    // this.mesh.material.uniforms['uBaseTexture'].value = this.imageDataTexture;
    this.updateCombinedLayers = true;
};
/**
 * Sculpt the terrain
 * @param  {enum} type Sculpt operation type e.g. GpuSkulpt.ADD
 * @param  {THREE.Vector3} position World-space position to sculpt at
 * @param  {number} amount Amount to sculpt
 */
GpuSkulpt.prototype.sculpt = function (type, position, amount) {
    this.skulptMaterial.uniforms['uSculptType'].value = type;
    this.isSculpting = true;
    this.sculptUvPos.x = (position.x + this.halfSize) / this.size;
    this.sculptUvPos.y = (position.z + this.halfSize) / this.size;
    if (type === 1) {
        this.mesh.material.uniforms['uCursorColor'].value.copy(this.cursorAddColor);
    } else if (type === 2) {
        this.mesh.material.uniforms['uCursorColor'].value.copy(this.cursorRemoveColor);
    }
};
/**
 * Clears the sculpts
 */
GpuSkulpt.prototype.clear = function () {
    this.shouldClear = true;
};
/**
 * Updates the cursor position
 * @param  {THREE.Vector3} position World-space position to update the cursor to
 */
GpuSkulpt.prototype.updateCursor = function (position) {
    this.sculptUvPos.x = (position.x + this.halfSize) / this.size;
    this.sculptUvPos.y = (position.z + this.halfSize) / this.size;
    this.mesh.material.uniforms['uCursorPos'].value.set(this.sculptUvPos.x, this.sculptUvPos.y);
    this.mesh.material.uniforms['uCursorColor'].value.copy(this.cursorHoverColor);
};
/**
 * Shows the sculpt cursor
 */
GpuSkulpt.prototype.showCursor = function () {
    this.mesh.material.uniforms['uShowCursor'].value = 1;
};
/**
 * Hides the sculpt cursor
 */
GpuSkulpt.prototype.hideCursor = function () {
    this.mesh.material.uniforms['uShowCursor'].value = 0;
};
//Returns the pixel unsigned byte data for the render target texture (readPixels() can only return unsigned byte data)
GpuSkulpt.prototype.__getPixelByteDataForRenderTarget = function (renderTarget, pixelByteData, width, height) {

    //I need to read in pixel data from WebGLRenderTarget but there seems to be no direct way.
    //Seems like I have to do some native WebGL stuff with readPixels().

    var gl = this.renderer.getContext();

    //bind texture to gl context
    gl.bindFramebuffer(gl.FRAMEBUFFER, renderTarget.__webglFramebuffer);

    //attach texture
    // gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, renderTarget.__webglTexture, 0);

    //read pixels
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixelByteData);

    //unbind
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

};
GpuSkulpt.prototype.__getPixelEncodedByteData = function (renderTarget, pixelByteData, channelId, width, height) {

    //encode the float data into an unsigned byte RGBA texture
    this.rttQuadMesh.material = this.rttEncodeFloatMaterial;
    this.rttEncodeFloatMaterial.uniforms['uTexture'].value = renderTarget;
    this.rttEncodeFloatMaterial.uniforms['uChannelMask'].value.copy(this.channelVectors[channelId]);
    this.renderer.render(this.rttScene, this.rttCamera, this.rttFloatEncoderRenderTarget, false);

    this.__getPixelByteDataForRenderTarget(this.rttFloatEncoderRenderTarget, pixelByteData, width, height);
};
/**
 * Gets float data for every pixel of the terrain texture
 * @return {Float32Array} Float data of every pixel of the terrain texture
 */
GpuSkulpt.prototype.getPixelFloatData = function () {

    //get the encoded byte data first
    this.__getPixelEncodedByteData(this.rttCombinedLayer, this.pixelByteData, 'r', this.res, this.res);

    //cast to float
    var pixelFloatData = new Float32Array(this.pixelByteData.buffer);
    return pixelFloatData;
};
/**
 * Gets float data for every pixel of the proxy terrain texture
 * @return {Float32Array} Float data of every pixel of the proxy terrain texture
 */
GpuSkulpt.prototype.getProxyPixelFloatData = function () {

    //render to proxy render target
    this.rttQuadMesh.material = this.rttProxyMaterial;
    this.rttProxyMaterial.uniforms['uTexture'].value = this.rttCombinedLayer;
    this.rttProxyMaterial.uniforms['uScale'].value = this.actualToProxyRatio;
    this.renderer.render(this.rttScene, this.rttCamera, this.rttProxyRenderTarget, false);

    //get the encoded byte data first
    this.__getPixelEncodedByteData(this.rttProxyRenderTarget, this.proxyPixelByteData, 'r', this.proxyRes, this.proxyRes);

    //cast to float
    var pixelFloatData = new Float32Array(this.proxyPixelByteData.buffer);
    return pixelFloatData;
};
/**
 * Adds callback function
 * @param {string} type Type of callback e.g. 'update'
 * @param {function} callbackFn Callback function
 */
GpuSkulpt.prototype.addCallback = function (type, callbackFn) {
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

GpuSkulpt.ADD = 1;
GpuSkulpt.REMOVE = 2;
