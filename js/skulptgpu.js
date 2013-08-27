/**
 * @fileOverview A JavaScript/GLSL sculpting script for sculpting Three.js meshes
 * @author Skeel Lee <skeel@skeelogy.com>
 * @version 0.1.0
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
    this.gridSize = this.size / this.res;

    this.imageProcessedData = new Float32Array(4 * this.res * this.res);
    this.imageDataTexture = new THREE.DataTexture(null, this.res, this.res, THREE.RGBAFormat, THREE.FloatType);

    this.isSculpting = false;
    this.sculptUvPos = new THREE.Vector2();

    this.shouldClear = false;

    this.linearFloatParams = {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
        format: THREE.RGBFormat,
        stencilBuffer: false,
        depthBuffer: false,
        type: THREE.FloatType
    };

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
            uTexelSize: { type: 'v2', value: new THREE.Vector2(1.0 / this.res, 1.0 / this.res) },
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
};
/**
 * Sets up the render-to-texture scene (2 render targets for accumulative feedback)
 */
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
    this.rttRenderTarget1 = new THREE.WebGLRenderTarget(this.res, this.res, this.linearFloatParams);
    this.rttRenderTarget1.generateMipmaps = false;
    this.rttRenderTarget2 = this.rttRenderTarget1.clone();

    //create a RTT render target for storing the combine results of all layers
    this.rttCombinedLayer = this.rttRenderTarget1.clone();
};
/**
 * Sets up the vertex-texture-fetch for the given mesh
 */
GpuSkulpt.prototype.__setupVtf = function () {
    THREE.ShaderManager.addShader('/glsl/heightMap.vert');
    THREE.ShaderManager.addShader('/glsl/lambertCursor.frag');
    this.mesh.material = new THREE.ShaderMaterial({
        uniforms: {
            uTexture: { type: 't', value: null },
            uTexelSize: { type: 'v2', value: new THREE.Vector2(1.0 / this.res, 1.0 / this.res) },
            uTexelWorldSize: { type: 'v2', value: new THREE.Vector2(this.gridSize, this.gridSize) },
            uHeightMultiplier: { type: 'f', value: 1.0 },
            uBaseColor: { type: 'v3', value: new THREE.Vector3(0.2, 1, 1) },
            uAmbientLightColor: { type: 'v3', value: new THREE.Vector3(1, 1, 1) },
            uAmbientLightIntensity: { type: 'f', value: 0.1 },
            uPointLight1WorldPos: { type: 'v3', value: new THREE.Vector3(2, 2, 2) },
            uPointLight1Color: { type: 'v3', value: new THREE.Vector3(1, 0, 0) },
            uPointLight1Intensity: { type: 'f', value: 3.0 },
            uPointLight1FalloffStart: { type: 'f', value: 1.0 },
            uPointLight1FalloffEnd: { type: 'f', value: 10.0 },
            uShowCursor: { type: 'i', value: 0 },
            uCursorPos: { type: 'v2', value: new THREE.Vector2() },
            uCursorRadius: { type: 'f', value: 0.0 },
            uCursorColor: { type: 'v3', value: new THREE.Vector3(1, 1, 0) }
        },
        vertexShader: THREE.ShaderManager.getShaderContents('/glsl/heightMap.vert'),
        fragmentShader: THREE.ShaderManager.getShaderContents('/glsl/lambertCursor.frag')
    });
};
GpuSkulpt.prototype.update = function () {

    //have to set flags from other places and then do all steps at once during update

    //clear sculpts if necessary
    if (this.shouldClear) {
        this.rttQuadMesh.material = this.clearMaterial;
        this.clearMaterial.uniforms.uColor.value.set(0.0, 0.0, 0.0, 0.0);
        this.renderer.render(this.rttScene, this.rttCamera, this.rttRenderTarget1, false);
        this.renderer.render(this.rttScene, this.rttCamera, this.rttRenderTarget2, false);
        this.shouldClear = false;
        this.updateCombinedLayers = true;
    }

    //do the main sculpting
    if (this.isSculpting) {
        this.rttQuadMesh.material = this.skulptMaterial;
        this.skulptMaterial.uniforms.uBaseTexture.value = this.imageDataTexture;
        this.skulptMaterial.uniforms.uSculptTexture1.value = this.rttRenderTarget2;
        this.skulptMaterial.uniforms.uIsSculpting.value = this.isSculpting;
        this.skulptMaterial.uniforms.uSculptPos.value.copy(this.sculptUvPos);
        this.renderer.render(this.rttScene, this.rttCamera, this.rttRenderTarget1, false);
        this.swapRenderTargets();
        this.isSculpting = false;
        this.updateCombinedLayers = true;
    }

    //combine layers into one
    if (this.updateCombinedLayers) {  //this can be triggered somewhere else without sculpting

        this.rttQuadMesh.material = this.combineTexturesMaterial;
        this.combineTexturesMaterial.uniforms.uTexture1.value = this.imageDataTexture;
        this.combineTexturesMaterial.uniforms.uTexture2.value = this.rttRenderTarget1;
        this.renderer.render(this.rttScene, this.rttCamera, this.rttCombinedLayer, false);
        this.updateCombinedLayers = false;

        //need to rebind rttCombinedLayer to uTexture
        this.mesh.material.uniforms.uTexture.value = this.rttCombinedLayer;
    }
};
GpuSkulpt.prototype.swapRenderTargets = function () {
    var temp = this.rttRenderTarget1;
    this.rttRenderTarget1 = this.rttRenderTarget2;
    this.rttRenderTarget2 = temp;
    // this.skulptMaterial.uniforms.uSculptTexture1.value = this.rttRenderTarget2;
};
GpuSkulpt.prototype.setBrushSize = function (size) {
    var normSize = size / (this.size * 2.0);
    this.skulptMaterial.uniforms.uSculptRadius.value = normSize;
    this.mesh.material.uniforms.uCursorRadius.value = normSize;
};
GpuSkulpt.prototype.setBrushAmount = function (amount) {
    this.skulptMaterial.uniforms.uSculptAmount.value = amount;
};
GpuSkulpt.prototype.loadFromImageData = function (data, amount, midGreyIsLowest)
{
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
    this.skulptMaterial.uniforms.uBaseTexture.value = this.imageDataTexture;
    this.combineTexturesMaterial.uniforms.uTexture1.value = this.imageDataTexture;
    // this.mesh.material.uniforms.uBaseTexture.value = this.imageDataTexture;
    this.updateCombinedLayers = true;
};
GpuSkulpt.prototype.sculpt = function (type, position, amount) {
    this.skulptMaterial.uniforms.uSculptType.value = type;
    this.isSculpting = true;
    this.sculptUvPos.x = (position.x + this.halfSize) / this.size;
    this.sculptUvPos.y = (position.z + this.halfSize) / this.size;
};
GpuSkulpt.prototype.clear = function () {
    this.shouldClear = true;
};
GpuSkulpt.prototype.updateCursor = function (position) {
    this.sculptUvPos.x = (position.x + this.halfSize) / this.size;
    this.sculptUvPos.y = (position.z + this.halfSize) / this.size;
    this.mesh.material.uniforms.uCursorPos.value.set(this.sculptUvPos.x, this.sculptUvPos.y);
};
GpuSkulpt.prototype.showCursor = function () {
    this.mesh.material.uniforms.uShowCursor.value = 1;
};
GpuSkulpt.prototype.hideCursor = function () {
    this.mesh.material.uniforms.uShowCursor.value = 0;
};

GpuSkulpt.ADD = 1;
GpuSkulpt.REMOVE = 2;
