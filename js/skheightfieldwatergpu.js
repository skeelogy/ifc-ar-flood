/**
 * @fileOverview GPU height field water simulations for Three.js flat planes
 * @author Skeel Lee <skeel@skeelogy.com>
 * @version 1.0.0
 */

/**
 * Abstract base class for GPU height field water simulations
 * @constructor
 */
function GpuHeightFieldWater(options) {

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
    if (typeof options.scene === 'undefined') {
        throw new Error('scene not specified');
    }
    this.scene = options.scene;
    if (typeof options.res === 'undefined') {
        throw new Error('res not specified');
    }
    this.res = options.res;
    if (typeof options.dampingFactor === 'undefined') {
        throw new Error('dampingFactor not specified');
    }
    this.__dampingFactor = options.dampingFactor;
    this.__defineGetter__('dampingFactor', function () {
        return this.__dampingFactor;
    });
    this.__defineSetter__('dampingFactor', function (value) {
        this.__dampingFactor = value;
        if (this.waterSimMaterial.uniforms.uDampingFactor) {
            this.waterSimMaterial.uniforms['uDampingFactor'].value = value;
        }
    });
    this.meanHeight = options.meanHeight || 0;
    this.density = options.density || 1000;  //default to 1000 kg per cubic metres

    //number of full steps to take per frame, to speed up some of algorithms that are slow to propagate at high mesh resolutions.
    //this is different from substeps which are reduces dt per step for stability.
    this.multisteps = options.multisteps || 1;

    this.shouldDisplaySimTexture = false;

    this.gravity = 9.81;

    this.halfSize = this.size / 2.0;
    this.segmentSize = this.size / this.res;
    this.segmentSizeSquared = this.segmentSize * this.segmentSize;
    this.texelSize = 1.0 / this.res;

    this.disturbMapHasUpdated = false;
    this.isDisturbing = false;
    this.disturbUvPos = new THREE.Vector2();
    this.disturbAmount = 0;
    this.disturbRadius = 0.0025 * this.size;
    this.isSourcing = false;
    this.sourceUvPos = new THREE.Vector2();
    this.sourceAmount = 0;
    this.sourceRadius = 0.0025 * this.size;

    this.linearFloatRGBAParams = {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
        format: THREE.RGBAFormat,
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

    //create a boundary texture
    this.boundaryData = new Float32Array(4 * this.res * this.res);
    this.boundaryTexture = new THREE.DataTexture(null, this.res, this.res, THREE.RGBAFormat, THREE.FloatType);

    //create an empty texture because the default value of textures does not seem to be 0?
    this.emptyTexture = new THREE.WebGLRenderTarget(this.res, this.res, this.linearFloatRGBAParams);
    this.emptyTexture.generateMipmaps = false;

    //camera depth range (for obstacles)
    this.rttObstaclesCameraRange = 50.0;

    this.pixelByteData = new Uint8Array(this.res * this.res * 4);

    this.staticObstacles = [];
    this.dynObstacles = [];
    this.shouldUpdateStaticObstacle = false;

    this.callbacks = {};

    this.__initCounter = 5;
    this.init();

    //setup obstacles
    this.__setupObstaclesScene();
}
GpuHeightFieldWater.prototype.init = function () {
    this.__checkExtensions();
    this.__setupShaders();
    this.__setupRttScene();
    this.__setupVtf();
    this.__initDataAndTextures();

    //init parallel reducer
    ParallelReducer.init(this.renderer, this.res, 1);
};
GpuHeightFieldWater.prototype.getWaterFragmentShaderUrl = function () {
    throw new Error('Abstract method not implemented');
};
GpuHeightFieldWater.prototype.__setupShaders = function () {

    THREE.ShaderManager.addShader('/glsl/passUv.vert');

    THREE.ShaderManager.addShader('/glsl/hfWater_disturb.frag');
    this.disturbAndSourceMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTexture: { type: 't', value: this.emptyTexture },
            uStaticObstaclesTexture: { type: 't', value: this.emptyTexture },
            uDisturbTexture: { type: 't', value: this.emptyTexture },
            uUseObstacleTexture: { type: 'i', value: 1 },  //turn on by default for most of the surface water types to use (pipe model will not need this)
            uIsDisturbing: { type: 'i', value: 0 },
            uDisturbPos: { type: 'v2', value: new THREE.Vector2(0.5, 0.5) },
            uDisturbAmount: { type: 'f', value: this.disturbAmount },
            uDisturbRadius: { type: 'f', value: this.disturbRadius },
            uIsSourcing: { type: 'i', value: 0 },
            uSourcePos: { type: 'v2', value: new THREE.Vector2(0.5, 0.5) },
            uSourceAmount: { type: 'f', value: this.sourceAmount },
            uSourceRadius: { type: 'f', value: this.sourceRadius }
        },
        vertexShader: THREE.ShaderManager.getShaderContents('/glsl/passUv.vert'),
        fragmentShader: THREE.ShaderManager.getShaderContents('/glsl/hfWater_disturb.frag')
    });

    THREE.ShaderManager.addShader(this.getWaterFragmentShaderUrl());
    this.waterSimMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTexture: { type: 't', value: this.emptyTexture },
            uTexelSize: { type: 'v2', value: new THREE.Vector2(this.texelSize, this.texelSize) },
            uTexelWorldSize: { type: 'v2', value: new THREE.Vector2(this.size / this.res, this.size / this.res) },
            uDampingFactor: { type: 'f', value: this.__dampingFactor },
            uDt: { type: 'f', value: 0.0 },
            uMeanHeight: { type: 'f', value: this.meanHeight }
        },
        vertexShader: THREE.ShaderManager.getShaderContents('/glsl/passUv.vert'),
        fragmentShader: THREE.ShaderManager.getShaderContents(this.getWaterFragmentShaderUrl())
    });

    THREE.ShaderManager.addShader('/glsl/setColor.frag');
    this.resetMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uColor: { type: 'v4', value: new THREE.Vector4() }
        },
        vertexShader: THREE.ShaderManager.getShaderContents('/glsl/passUv.vert'),
        fragmentShader: THREE.ShaderManager.getShaderContents('/glsl/setColor.frag')
    });

    THREE.ShaderManager.addShader('/glsl/setColorMasked.frag');
    this.resetMaskedMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTexture: { type: 't', value: this.emptyTexture },
            uColor: { type: 'v4', value: new THREE.Vector4() },
            uChannelMask: { type: 'v4', value: new THREE.Vector4() }
        },
        vertexShader: THREE.ShaderManager.getShaderContents('/glsl/passUv.vert'),
        fragmentShader: THREE.ShaderManager.getShaderContents('/glsl/setColorMasked.frag')
    });

    THREE.ShaderManager.addShader('/glsl/setSolidAlpha.frag');
    this.setSolidAlphaMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTexture: { type: 't', value: this.emptyTexture }
        },
        vertexShader: THREE.ShaderManager.getShaderContents('/glsl/passUv.vert'),
        fragmentShader: THREE.ShaderManager.getShaderContents('/glsl/setSolidAlpha.frag')
    });

    THREE.ShaderManager.addShader('/glsl/hfWater_obstacles_static.frag');
    this.staticObstaclesMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uObstacleTopTexture: { type: 't', value: this.emptyTexture },
            uHalfRange: { type: 'f', value: this.rttObstaclesCameraRange / 2.0 }
        },
        vertexShader: THREE.ShaderManager.getShaderContents('/glsl/passUv.vert'),
        fragmentShader: THREE.ShaderManager.getShaderContents('/glsl/hfWater_obstacles_static.frag')
    });

    THREE.ShaderManager.addShader('/glsl/hfWater_obstacles_dynamic.frag');
    this.dynObstaclesMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uObstaclesTexture: { type: 't', value: this.emptyTexture },
            uObstacleTopTexture: { type: 't', value: this.emptyTexture },
            uObstacleBottomTexture: { type: 't', value: this.emptyTexture },
            uWaterTexture: { type: 't', value: this.emptyTexture },
            uTerrainTexture: { type: 't', value: this.emptyTexture },
            uHalfRange: { type: 'f', value: this.rttObstaclesCameraRange / 2.0 }
        },
        vertexShader: THREE.ShaderManager.getShaderContents('/glsl/passUv.vert'),
        fragmentShader: THREE.ShaderManager.getShaderContents('/glsl/hfWater_obstacles_dynamic.frag')
    });

    THREE.ShaderManager.addShader('/glsl/encodeFloat.frag');
    this.rttEncodeFloatMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTexture: { type: 't', value: this.emptyTexture },
            uChannelMask: { type: 'v4', value: new THREE.Vector4() }
        },
        vertexShader: THREE.ShaderManager.getShaderContents('/glsl/passUv.vert'),
        fragmentShader: THREE.ShaderManager.getShaderContents('/glsl/encodeFloat.frag')
    });

    THREE.ShaderManager.addShader('/glsl/copyChannels.frag');
    this.copyChannelsMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTexture: { type: 't', value: this.emptyTexture },
            uOriginChannelId: { type: 'v4', value: new THREE.Vector4() },
            uDestChannelId: { type: 'v4', value: new THREE.Vector4() }
        },
        vertexShader: THREE.ShaderManager.getShaderContents('/glsl/passUv.vert'),
        fragmentShader: THREE.ShaderManager.getShaderContents('/glsl/copyChannels.frag')
    });

    THREE.ShaderManager.addShader('/glsl/hfWater_calcDisturbMap.frag');
    this.calcDisturbMapMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTexture: { type: 't', value: this.emptyTexture },
            uTexelSize: { type: 'v2', value: new THREE.Vector2(this.texelSize, this.texelSize) }
        },
        vertexShader: THREE.ShaderManager.getShaderContents('/glsl/passUv.vert'),
        fragmentShader: THREE.ShaderManager.getShaderContents('/glsl/hfWater_calcDisturbMap.frag')
    });

    THREE.ShaderManager.addShader('/glsl/gaussianBlurX.frag');
    this.gaussianBlurXMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTexture: { type: 't', value: this.emptyTexture },
            uTexelSize: { type: 'f', value: this.texelSize }
        },
        vertexShader: THREE.ShaderManager.getShaderContents('/glsl/passUv.vert'),
        fragmentShader: THREE.ShaderManager.getShaderContents('/glsl/gaussianBlurX.frag')
    });

    THREE.ShaderManager.addShader('/glsl/gaussianBlurY.frag');
    this.gaussianBlurYMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTexture: { type: 't', value: this.emptyTexture },
            uTexelSize: { type: 'f', value: this.texelSize }
        },
        vertexShader: THREE.ShaderManager.getShaderContents('/glsl/passUv.vert'),
        fragmentShader: THREE.ShaderManager.getShaderContents('/glsl/gaussianBlurY.frag')
    });

    THREE.ShaderManager.addShader('/glsl/combineTextures.frag');
    this.combineTexturesMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTexture1: { type: 't', value: this.emptyTexture },
            uTexture2: { type: 't', value: this.emptyTexture }
        },
        vertexShader: THREE.ShaderManager.getShaderContents('/glsl/passUv.vert'),
        fragmentShader: THREE.ShaderManager.getShaderContents('/glsl/combineTextures.frag')
    });

    THREE.ShaderManager.addShader('/glsl/erode.frag');
    this.erodeMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTexture: { type: 't', value: this.emptyTexture },
            uTexelSize: { type: 'f', value: this.texelSize }
        },
        vertexShader: THREE.ShaderManager.getShaderContents('/glsl/passUv.vert'),
        fragmentShader: THREE.ShaderManager.getShaderContents('/glsl/erode.frag')
    });


    this.channelVectors = {
        'r': new THREE.Vector4(1, 0, 0, 0),
        'g': new THREE.Vector4(0, 1, 0, 0),
        'b': new THREE.Vector4(0, 0, 1, 0),
        'a': new THREE.Vector4(0, 0, 0, 1)
    };
};
//Sets up the render-to-texture scene (2 render targets by default)
GpuHeightFieldWater.prototype.__setupRttScene = function () {

    //TODO: some of these belong in superclass

    //create a RTT scene
    this.rttScene = new THREE.Scene();

    //create an orthographic RTT camera
    var far = 10000;
    var near = -far;
    this.rttCamera = new THREE.OrthographicCamera(-this.halfSize, this.halfSize, this.halfSize, -this.halfSize, near, far);

    //create a quad which we will use to invoke the shaders
    this.rttQuadGeom = new THREE.PlaneGeometry(this.size, this.size);
    this.rttQuadMesh = new THREE.Mesh(this.rttQuadGeom, this.waterSimMaterial);
    this.rttScene.add(this.rttQuadMesh);

    //create RTT render targets (we need two to do feedback)
    this.rttRenderTarget1 = new THREE.WebGLRenderTarget(this.res, this.res, this.linearFloatRGBAParams);
    this.rttRenderTarget1.generateMipmaps = false;
    this.rttRenderTarget2 = this.rttRenderTarget1.clone();

    //create a render target purely for display purposes
    this.rttDisplay = this.rttRenderTarget1.clone();

    //create another RTT render target encoding float to 4-byte data
    this.rttFloatEncoderRenderTarget = new THREE.WebGLRenderTarget(this.res, this.res, this.nearestFloatRGBAParams);
    this.rttFloatEncoderRenderTarget.generateMipmaps = false;

    //some render targets for blurred textures
    this.rttCombinedHeightsBlurredRenderTarget = this.rttRenderTarget1.clone();
    this.rttDynObstaclesBlurredRenderTarget = this.rttRenderTarget1.clone();

    //create render target for storing the disturbed map (due to interaction with rigid bodes)
    this.rttDisturbMapRenderTarget = this.rttRenderTarget1.clone();
};
//Sets up the vertex-texture-fetch for the given mesh
GpuHeightFieldWater.prototype.__setupVtf = function () {
    this.mesh.material = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.merge([
            THREE.UniformsLib['lights'],
            THREE.UniformsLib['shadowmap'],
            {
                uTexture: { type: 't', value: this.rttRenderTarget1 },
                uTexelSize: { type: 'v2', value: new THREE.Vector2(this.texelSize, this.texelSize) },
                uTexelWorldSize: { type: 'v2', value: new THREE.Vector2(this.segmentSize, this.segmentSize) },
                uHeightMultiplier: { type: 'f', value: 1.0 },
                uBaseColor: { type: 'v3', value: new THREE.Vector3(0.45, 0.95, 1.0) }
            }
        ]),
        vertexShader: THREE.ShaderManager.getShaderContents('heightmapVS'),
        fragmentShader: THREE.ShaderManager.getShaderContents('lambertFS'),
        lights: true
    });
};
//Checks for WebGL extensions. Checks for OES_texture_float_linear and vertex texture fetch capability by default.
GpuHeightFieldWater.prototype.__checkExtensions = function (renderer) {
    var context = this.renderer.context;
    if (!context.getExtension('OES_texture_float_linear')) {
        throw new Error('Extension not available: OES_texture_float_linear');
    }
    if (!context.getParameter(context.MAX_VERTEX_TEXTURE_IMAGE_UNITS)) {
        throw new Error('Vertex textures not supported on your graphics card');
    }
};
GpuHeightFieldWater.prototype.__initDataAndTextures = function () {

    var i, j, len, idx;

    //init everything to 1 first
    for (i = 0, len = this.boundaryData.length; i < len; i++) {
        this.boundaryData[i] = 1.0;
    }

    //init all boundary values to 0
    j = 0;
    for (i = 0; i < this.res; i++) {
        idx = 4 * (i + this.res * j);
        this.boundaryData[idx] = 0.0;
        this.boundaryData[idx + 1] = 0.0;
        this.boundaryData[idx + 2] = 0.0;
        this.boundaryData[idx + 3] = 0.0;
    }
    j = this.res - 1;
    for (i = 0; i < this.res; i++) {
        idx = 4 * (i + this.res * j);
        this.boundaryData[idx] = 0.0;
        this.boundaryData[idx + 1] = 0.0;
        this.boundaryData[idx + 2] = 0.0;
        this.boundaryData[idx + 3] = 0.0;
    }
    i = 0;
    for (j = 0; j < this.res; j++) {
        idx = 4 * (i + this.res * j);
        this.boundaryData[idx] = 0.0;
        this.boundaryData[idx + 1] = 0.0;
        this.boundaryData[idx + 2] = 0.0;
        this.boundaryData[idx + 3] = 0.0;
    }
    i = this.res - 1;
    for (j = 0; j < this.res; j++) {
        idx = 4 * (i + this.res * j);
        this.boundaryData[idx] = 0.0;
        this.boundaryData[idx + 1] = 0.0;
        this.boundaryData[idx + 2] = 0.0;
        this.boundaryData[idx + 3] = 0.0;
    }

    //finally assign data to texture
    this.boundaryTexture.image.data = this.boundaryData;
    this.boundaryTexture.needsUpdate = true;
};
GpuHeightFieldWater.prototype.__setupObstaclesScene = function () {

    //create top and bottom cameras
    this.rttObstaclesTopCamera = new THREE.OrthographicCamera(-this.halfSize, this.halfSize, -this.halfSize, this.halfSize, 0, this.rttObstaclesCameraRange);
    this.rttObstaclesTopCamera.position.y = -this.rttObstaclesCameraRange / 2;
    this.rttObstaclesTopCamera.rotation.x = THREE.Math.degToRad(90);
    this.rttObstaclesBottomCamera = new THREE.OrthographicCamera(-this.halfSize, this.halfSize, -this.halfSize, this.halfSize, 0, this.rttObstaclesCameraRange);
    this.rttObstaclesBottomCamera.position.y = this.rttObstaclesCameraRange / 2;
    this.rttObstaclesBottomCamera.rotation.x = THREE.Math.degToRad(-90);

    //create obstacles render targets and two more for top and bottom views
    this.rttStaticObstaclesRenderTarget = this.rttRenderTarget1.clone();
    this.rttDynObstaclesRenderTarget = this.rttRenderTarget1.clone();
    this.rttObstacleTopRenderTarget = this.rttRenderTarget1.clone();
    this.rttObstacleBottomRenderTarget = this.rttRenderTarget1.clone();

    //create render target for masking out water areas based on obstacle's alpha
    this.rttMaskedWaterRenderTarget = this.rttRenderTarget1.clone();

    //create material for rendering the obstacles
    THREE.ShaderManager.addShader('/glsl/pass.vert');
    THREE.ShaderManager.addShader('/glsl/depth.frag');
    this.rttObstaclesDepthMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uNear: { type: 'f', value: 0 },
            uFar: { type: 'f', value: this.rttObstaclesCameraRange }
        },
        vertexShader: THREE.ShaderManager.getShaderContents('/glsl/pass.vert'),
        fragmentShader: THREE.ShaderManager.getShaderContents('/glsl/depth.frag')
    });

    //create material for masking out water texture
    THREE.ShaderManager.addShader('/glsl/combineTexturesMask.frag');
    this.maskWaterMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTexture1: { type: 't', value: this.emptyTexture },
            uTexture2: { type: 't', value: this.emptyTexture }
        },
        vertexShader: THREE.ShaderManager.getShaderContents('/glsl/passUv.vert'),
        fragmentShader: THREE.ShaderManager.getShaderContents('/glsl/combineTexturesMask.frag')
    });
};
GpuHeightFieldWater.prototype.reset = function () {
    this.__initCounter = 5;
};
GpuHeightFieldWater.prototype.resetPass = function () {
    //reset height in main render target
    this.rttQuadMesh.material = this.resetMaterial;
    this.resetMaterial.uniforms['uColor'].value.set(this.meanHeight, 0, 0, this.meanHeight);
    this.renderer.render(this.rttScene, this.rttCamera, this.rttRenderTarget2, false);
    this.swapRenderTargets();
};
/**
 * Disturbs the water
 * @param  {THREE.Vector3} position World-space position to disturb at
 * @param  {number} amount Amount of water to disturb
 * @param  {number} radius Radius of disturb
 */
GpuHeightFieldWater.prototype.disturb = function (position, amount, radius) {
    this.isDisturbing = true;
    this.disturbUvPos.x = (position.x + this.halfSize) / this.size;
    this.disturbUvPos.y = (position.z + this.halfSize) / this.size;
    this.disturbAmount = amount;
    this.disturbRadius = radius;
};
/**
 * Flood the scene by the given volume
 * @param  {number} volume Volume of water to flood the scene with
 */
GpuHeightFieldWater.prototype.flood = function (volume) {
    this.meanHeight += volume / (this.res * this.res);
};
GpuHeightFieldWater.prototype.disturbPass = function () {
    if (this.isDisturbing) {
        this.rttQuadMesh.material = this.disturbAndSourceMaterial;
        this.disturbAndSourceMaterial.uniforms['uTexture'].value = this.rttRenderTarget2;
        this.disturbAndSourceMaterial.uniforms['uStaticObstaclesTexture'].value = this.rttStaticObstaclesRenderTarget;
        this.disturbAndSourceMaterial.uniforms['uDisturbTexture'].value = this.rttDisturbMapRenderTarget;
        this.disturbAndSourceMaterial.uniforms['uIsDisturbing'].value = this.isDisturbing;
        this.disturbAndSourceMaterial.uniforms['uDisturbPos'].value.copy(this.disturbUvPos);
        this.disturbAndSourceMaterial.uniforms['uDisturbAmount'].value = this.disturbAmount;
        this.disturbAndSourceMaterial.uniforms['uDisturbRadius'].value = this.disturbRadius / this.size;

        this.renderer.render(this.rttScene, this.rttCamera, this.rttRenderTarget1, false);
        this.swapRenderTargets();

        this.isDisturbing = false;
        this.rttQuadMesh.material.uniforms['uIsDisturbing'].value = false;
    }
};
GpuHeightFieldWater.prototype.waterSimPass = function (substepDt) {
    this.rttQuadMesh.material = this.waterSimMaterial;
    this.waterSimMaterial.uniforms['uTexture'].value = this.rttRenderTarget2;
    this.waterSimMaterial.uniforms['uDt'].value = substepDt;
    this.waterSimMaterial.uniforms['uMeanHeight'].value = this.meanHeight;
    this.renderer.render(this.rttScene, this.rttCamera, this.rttRenderTarget1, false);
    this.swapRenderTargets();
};
GpuHeightFieldWater.prototype.displayPass = function () {
    if (this.shouldDisplaySimTexture) {
        this.rttQuadMesh.material = this.setSolidAlphaMaterial;
        this.setSolidAlphaMaterial.uniforms['uTexture'].value = this.rttRenderTarget2;
        this.renderer.render(this.rttScene, this.rttCamera, this.rttDisplay, false);
        this.swapRenderTargets();
    }
};
GpuHeightFieldWater.prototype.calculateSubsteps = function (dt) {
    return 1;
};
/**
 * Updates the water simulation
 * @param  {number} dt Elapsed time
 */
GpuHeightFieldWater.prototype.update = function (dt) {

    //NOTE: unable to figure out why cannot clear until a few updates later,
    //so using this dirty hack to init for a few frames
    if (this.__initCounter > 0) {
        this.resetPass();
        this.__initCounter -= 1;
        return;
    }

    //fix dt for the moment (better to be in slow-mo in extreme cases than to explode)
    dt = 1.0 / 60.0;

    //update static obstacle texture
    if (this.shouldUpdateStaticObstacle) {
        this.updateStaticObstacleTexture(dt);
        this.shouldUpdateStaticObstacle = false;
    }

    //update dynamic obstacle textures
    if (this.dynObstacles.length > 0) {
        this.updateDynObstacleTexture(dt);
    }

    //do multiple full steps per frame to speed up some of algorithms that are slow to propagate at high mesh resolutions
    var i;
    for (i = 0; i < this.multisteps; i++) {
        this.step(dt);
    }

    //post step
    this.postStepPass();

    //display pass
    this.displayPass();
};
GpuHeightFieldWater.prototype.step = function (dt) {

    //calculate the number of substeps needed
    var substeps = this.calculateSubsteps(dt);
    var substepDt = dt / substeps;

    //disturb
    this.disturbPass();

    //water sim
    var i;
    for (i = 0; i < substeps; i++) {
        this.waterSimPass(substepDt);
    }
};
GpuHeightFieldWater.prototype.postStepPass = function () {
    //rebind render target to water mesh to ensure vertex shader gets the right texture
    this.mesh.material.uniforms['uTexture'].value = this.rttRenderTarget1;
};
GpuHeightFieldWater.prototype.swapRenderTargets = function () {
    var temp = this.rttRenderTarget1;
    this.rttRenderTarget1 = this.rttRenderTarget2;
    this.rttRenderTarget2 = temp;
    // this.rttQuadMesh.material.uniforms['uTexture'].value = this.rttRenderTarget2;
};
/**
 * Adds a static obstacle into the system
 * @param {THREE.Mesh} mesh Mesh to use as a static obstacle
 */
GpuHeightFieldWater.prototype.addStaticObstacle = function (mesh) {
    if (!(mesh instanceof THREE.Mesh)) {
        throw new Error('mesh must be of type THREE.Mesh');
    }

    if (!mesh.__skhfwater) {
        mesh.__skhfwater = {};
    }
    mesh.__skhfwater.isObstacle = true;
    mesh.__skhfwater.isDynamic = false;
    mesh.__skhfwater.mass = 0;
    this.staticObstacles.push(mesh);

    //set a flag to indicate that we want to update static obstacle texture during update() call
    this.shouldUpdateStaticObstacle = true;
};
/**
 * Adds a dynamic obstacle into the system
 * @param {THREE.Mesh} mesh Mesh to use as a dynamic obstacle
 * @param {number} mass Mass of the dynamic obstacle
 */
GpuHeightFieldWater.prototype.addDynamicObstacle = function (mesh, mass) {
    if (!(mesh instanceof THREE.Mesh)) {
        throw new Error('mesh must be of type THREE.Mesh');
    }
    if (typeof mass === 'undefined') {
        throw new Error('mass not specified');
    }
    if (!mesh.__skhfwater) {
        mesh.__skhfwater = {};
    }
    mesh.__skhfwater.isObstacle = true;
    mesh.__skhfwater.isDynamic = true;
    mesh.__skhfwater.mass = mass;
    this.dynObstacles.push(mesh);
};
/**
 * Removes obstacle from the system
 * @param  {THREE.Mesh} mesh Mesh of the obstacle to remove
 */
GpuHeightFieldWater.prototype.removeObstacle = function (mesh) {

    //remove from dynamic obstacle array if it exists
    var i, len;
    for (i = 0, len = this.dynObstacles.length; i < len; i++) {
        if (this.dynObstacles[i] === mesh) {
            this.dynObstacles.splice(i, 1);
        }
    }

    //remove from static obstacle array if it exists
    var isStaticObstacle = false;
    for (i = 0, len = this.staticObstacles.length; i < len; i++) {
        if (this.staticObstacles[i] === mesh) {
            this.staticObstacles.splice(i, 1);
            isStaticObstacle = true;
        }
    }
    if (isStaticObstacle) {
        //set a flag to indicate that we want to update static obstacle texture during update() call
        this.shouldUpdateStaticObstacle = true;
    }
};
//This should only be called during update() call. Should not be called directly.
GpuHeightFieldWater.prototype.updateStaticObstacleTexture = function (dt) {

    //static obstacle map just needs the top height (like the terrain)

    //clear obstacle texture first
    this.rttQuadMesh.material = this.resetMaterial;
    this.resetMaterial.uniforms['uColor'].value.set(0, 0, 0, 1);  //set unused alpha channel to 1 so that we can see the result
    this.renderer.render(this.rttScene, this.rttCamera, this.rttStaticObstaclesRenderTarget, false);
    this.resetMaterial.uniforms['uColor'].value.set(0, 0, 0, 0);
    this.renderer.render(this.rttScene, this.rttCamera, this.rttObstacleTopRenderTarget, false);

    var that = this;

    //hide and reset everything in scene
    this.scene.traverse(function (object) {
        object.visibleStore = object.visible;
        object.visible = false;
    });

    //set an override depth map material for the scene
    this.scene.overrideMaterial = this.rttObstaclesDepthMaterial;

    //show all static obstacles
    var i, len;
    for (i = 0, len = this.staticObstacles.length; i < len; i++) {
        this.staticObstacles[i].visible = true;
    }

    //render from the top view to get the top height
    this.renderer.render(this.scene, this.rttObstaclesTopCamera, this.rttObstacleTopRenderTarget, false);

    //process this depth actual height
    this.rttQuadMesh.material = this.staticObstaclesMaterial;
    this.staticObstaclesMaterial.uniforms['uObstacleTopTexture'].value = this.rttObstacleTopRenderTarget;
    this.renderer.render(this.rttScene, this.rttCamera, this.rttStaticObstaclesRenderTarget, false);

    //erode the map so that the water heights won't show at the sides of the obstacles
    this.rttQuadMesh.material = this.erodeMaterial;
    this.erodeMaterial.uniforms['uTexture'].value = this.rttStaticObstaclesRenderTarget;
    this.renderer.render(this.rttScene, this.rttCamera, this.rttStaticObstaclesRenderTarget, false);
    this.renderer.render(this.rttScene, this.rttCamera, this.rttStaticObstaclesRenderTarget, false);

    //remove scene override material
    this.scene.overrideMaterial = null;

    //restore visibility in the scene
    this.scene.traverse(function (object) {
        object.visible = object.visibleStore;
    });
};
GpuHeightFieldWater.prototype.updateDynObstacleTexture = function (dt) {

    //store accumulated displaced height channel from previous frame first (by copying G channel to B channel)
    this.rttQuadMesh.material = this.copyChannelsMaterial;
    this.copyChannelsMaterial.uniforms['uTexture'].value = this.rttDynObstaclesRenderTarget;
    this.copyChannelsMaterial.uniforms['uOriginChannelId'].value.copy(this.channelVectors.g);
    this.copyChannelsMaterial.uniforms['uDestChannelId'].value.copy(this.channelVectors.b);
    this.renderer.render(this.rttScene, this.rttCamera, this.rttDynObstaclesRenderTarget, false);

    //clear obstacle textures
    this.rttQuadMesh.material = this.resetMaskedMaterial;
    this.resetMaskedMaterial.uniforms['uTexture'].value = this.rttDynObstaclesRenderTarget;
    this.resetMaskedMaterial.uniforms['uColor'].value.set(0, 0, 0, 0);
    this.resetMaskedMaterial.uniforms['uChannelMask'].value.set(1, 1, 0, 1);  //don't clear B channel which stores previous displaced vol
    this.renderer.render(this.rttScene, this.rttCamera, this.rttDynObstaclesRenderTarget, false);

    //combine water and terrain heights into one and then blur it
    this.rttQuadMesh.material = this.combineTexturesMaterial;
    this.combineTexturesMaterial.uniforms['uTexture1'].value = this.rttRenderTarget2;
    this.combineTexturesMaterial.uniforms['uTexture2'].value = this.terrainTexture;
    this.renderer.render(this.rttScene, this.rttCamera, this.rttCombinedHeightsBlurredRenderTarget, false);
    this.rttQuadMesh.material = this.gaussianBlurXMaterial;
    this.gaussianBlurXMaterial.uniforms['uTexture'].value = this.rttCombinedHeightsBlurredRenderTarget;
    this.gaussianBlurXMaterial.uniforms['uTexelSize'].value = 1.0 / this.res;
    this.renderer.render(this.rttScene, this.rttCamera, this.rttCombinedHeightsBlurredRenderTarget, false);
    this.rttQuadMesh.material = this.gaussianBlurYMaterial;
    this.gaussianBlurYMaterial.uniforms['uTexture'].value = this.rttCombinedHeightsBlurredRenderTarget;
    this.gaussianBlurYMaterial.uniforms['uTexelSize'].value = 1.0 / this.res;
    this.renderer.render(this.rttScene, this.rttCamera, this.rttCombinedHeightsBlurredRenderTarget, false);

    var that = this;

    //hide and reset everything in scene
    this.scene.traverse(function (object) {
        object.visibleStore = object.visible;
        object.visible = false;
    });

    //set an override depth map material for the scene
    this.scene.overrideMaterial = this.rttObstaclesDepthMaterial;

    //render top & bottom of each obstacle and compare to current water texture
    this.scene.traverse(function (object) {
        if (object instanceof THREE.Mesh && object.__skhfwater && object.__skhfwater.isObstacle && object.__skhfwater.isDynamic) {

            //show current mesh
            object.visible = true;

            //clear top and bottom render targets
            that.rttQuadMesh.material = that.resetMaterial;
            that.resetMaterial.uniforms['uColor'].value.set(0, 0, 0, 0);
            that.renderer.render(that.rttScene, that.rttCamera, that.rttObstacleTopRenderTarget, false);
            that.renderer.render(that.rttScene, that.rttCamera, that.rttObstacleBottomRenderTarget, false);

            //render top and bottom depth maps
            that.renderer.render(that.scene, that.rttObstaclesTopCamera, that.rttObstacleTopRenderTarget, false);
            that.renderer.render(that.scene, that.rttObstaclesBottomCamera, that.rttObstacleBottomRenderTarget, false);

            //update obstacle texture
            that.rttQuadMesh.material = that.dynObstaclesMaterial;
            that.dynObstaclesMaterial.uniforms['uObstaclesTexture'].value = that.rttDynObstaclesRenderTarget;
            that.dynObstaclesMaterial.uniforms['uObstacleTopTexture'].value = that.rttObstacleTopRenderTarget;
            that.dynObstaclesMaterial.uniforms['uObstacleBottomTexture'].value = that.rttObstacleBottomRenderTarget;
            that.dynObstaclesMaterial.uniforms['uWaterTexture'].value = that.rttCombinedHeightsBlurredRenderTarget;  //use blurred heights
            that.dynObstaclesMaterial.uniforms['uTerrainTexture'].value = that.emptyTexture;
            that.renderer.render(that.rttScene, that.rttCamera, that.rttDynObstaclesRenderTarget, false);

            //if object is dynamic, store additional info
            // if (object.__skhfwater.isDynamic) {

            //TODO: reduce the number of texture reads to speed up (getPixels() is very expensive)

            //find total water volume displaced by this object (from A channel data)
            ParallelReducer.reduce(that.rttDynObstaclesRenderTarget, 'sum', 'a');
            object.__skhfwater.totalDisplacedVol = ParallelReducer.getPixelFloatData('a')[0] * that.segmentSizeSquared;  //cubic metres

            //mask out velocity field using object's alpha
            that.rttQuadMesh.material = that.maskWaterMaterial;
            that.maskWaterMaterial.uniforms['uTexture1'].value = that.rttRenderTarget1;
            that.maskWaterMaterial.uniforms['uTexture2'].value = that.rttObstacleTopRenderTarget;
            that.renderer.render(that.rttScene, that.rttCamera, that.rttMaskedWaterRenderTarget, false);

            //find total horizontal velocities affecting this object
            ParallelReducer.reduce(that.rttMaskedWaterRenderTarget, 'sum', 'g');
            object.__skhfwater.totalVelocityX = ParallelReducer.getPixelFloatData('g')[0];
            ParallelReducer.reduce(that.rttMaskedWaterRenderTarget, 'sum', 'b');
            object.__skhfwater.totalVelocityZ = ParallelReducer.getPixelFloatData('b')[0];

            //calculate total area covered by this object
            ParallelReducer.reduce(that.rttObstacleTopRenderTarget, 'sum', 'a');
            object.__skhfwater.totalArea = ParallelReducer.getPixelFloatData('a')[0];

            //calculate average velocities affecting this object
            if (object.__skhfwater.totalArea === 0.0) {
                object.__skhfwater.averageVelocityX = 0;
                object.__skhfwater.averageVelocityZ = 0;
            } else {
                object.__skhfwater.averageVelocityX = object.__skhfwater.totalVelocityX / object.__skhfwater.totalArea;
                object.__skhfwater.averageVelocityZ = object.__skhfwater.totalVelocityZ / object.__skhfwater.totalArea;
            }

            //calculate forces that should be exerted on this object
            object.__skhfwater.forceX = object.__skhfwater.averageVelocityX / dt * object.__skhfwater.mass;
            object.__skhfwater.forceY = object.__skhfwater.totalDisplacedVol * that.density * that.gravity;
            object.__skhfwater.forceZ = object.__skhfwater.averageVelocityZ / dt * object.__skhfwater.mass;

            //call exertForce callbacks
            if (that.callbacks.hasOwnProperty('exertForce')) {
                var renderCallbacks = that.callbacks['exertForce'];
                var i, len;
                for (i = 0, len = renderCallbacks.length; i < len; i++) {
                    renderCallbacks[i](object, new THREE.Vector3(object.__skhfwater.forceX, object.__skhfwater.forceY, object.__skhfwater.forceZ));
                }
            }

            // }

            //hide current mesh
            object.visible = false;
        }
    });

    //remove scene override material
    this.scene.overrideMaterial = null;

    //restore visibility in the scene
    this.scene.traverse(function (object) {
        object.visible = object.visibleStore;
    });

    //---------------------------------------------
    //calculate rigid bodies' influence on water:
    //---------------------------------------------

    //blur the obstacles map
    this.rttQuadMesh.material = this.gaussianBlurXMaterial;
    this.gaussianBlurXMaterial.uniforms['uTexture'].value = this.rttDynObstaclesRenderTarget;
    this.gaussianBlurXMaterial.uniforms['uTexelSize'].value = 1.0 / this.res;
    this.renderer.render(this.rttScene, this.rttCamera, this.rttDynObstaclesBlurredRenderTarget, false);  //need to render to another target to avoid corrupting original accumulated
    this.rttQuadMesh.material = this.gaussianBlurYMaterial;
    this.gaussianBlurYMaterial.uniforms['uTexture'].value = this.rttDynObstaclesBlurredRenderTarget;
    this.gaussianBlurYMaterial.uniforms['uTexelSize'].value = 1.0 / this.res;
    this.renderer.render(this.rttScene, this.rttCamera, this.rttDynObstaclesBlurredRenderTarget, false);

    //calculate a map with additional heights to disturb water, based on differences in water volumes between frames
    this.rttQuadMesh.material = this.calcDisturbMapMaterial;
    this.calcDisturbMapMaterial.uniforms['uTexture'].value = this.rttDynObstaclesBlurredRenderTarget;  //use blurred obstacle maps
    this.renderer.render(this.rttScene, this.rttCamera, this.rttDisturbMapRenderTarget, false);
    this.disturbMapHasUpdated = true;

};
//Returns the pixel unsigned byte data for the render target texture (readPixels() can only return unsigned byte data)
GpuHeightFieldWater.prototype.__getPixelByteDataForRenderTarget = function (renderTarget, pixelByteData, width, height) {

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
GpuHeightFieldWater.prototype.__getPixelEncodedByteData = function (renderTarget, pixelByteData, channelId, width, height) {

    //encode the float data into an unsigned byte RGBA texture
    this.rttQuadMesh.material = this.rttEncodeFloatMaterial;
    this.rttEncodeFloatMaterial.uniforms['uTexture'].value = renderTarget;
    this.rttEncodeFloatMaterial.uniforms['uChannelMask'].value.copy(this.channelVectors[channelId]);
    this.renderer.render(this.rttScene, this.rttCamera, this.rttFloatEncoderRenderTarget, false);

    this.__getPixelByteDataForRenderTarget(this.rttFloatEncoderRenderTarget, pixelByteData, width, height);
};
/**
 * Returns the pixel float data for the water textures
 * @return {Float32Array} Float data of the water texture
 */
GpuHeightFieldWater.prototype.getPixelFloatData = function () {

    //get the encoded byte data first
    this.__getPixelEncodedByteData(this.rttRenderTarget1, this.pixelByteData, 'r', this.res, this.res);

    //cast to float
    var pixelFloatData = new Float32Array(this.pixelByteData.buffer);
    return pixelFloatData;
};
/**
 * Adds a callback
 * @param {string} type Type of callback e.g. 'exertForce'
 * @param {function} callbackFn Callback function
 */
GpuHeightFieldWater.prototype.addCallback = function (type, callbackFn) {
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
 * GPU height field water simulation based on "Fast Water Simulation for Games Using Height Fields" (Matthias Mueller-Fisher, GDC2008)
 * @constructor
 * @extends {GpuHeightFieldWater}
 */
function GpuMuellerGdc2008Water(options) {

    if (typeof options.horizontalSpeed === 'undefined') {
        throw new Error('horizontalSpeed not specified');
    }
    this.horizontalSpeed = options.horizontalSpeed;

    GpuHeightFieldWater.call(this, options);

    this.maxDt = this.segmentSize / this.horizontalSpeed;  //based on CFL condition
}
//inherit
GpuMuellerGdc2008Water.prototype = Object.create(GpuHeightFieldWater.prototype);
GpuMuellerGdc2008Water.prototype.constructor = GpuMuellerGdc2008Water;
//override
GpuMuellerGdc2008Water.prototype.getWaterFragmentShaderUrl = function () {
    return '/glsl/hfWater_muellerGdc2008.frag';
};
GpuMuellerGdc2008Water.prototype.__setupShaders = function () {
    GpuHeightFieldWater.prototype.__setupShaders.call(this);

    //add uHorizontalSpeed into the uniforms
    this.waterSimMaterial.uniforms.uHorizontalSpeed = { type: 'f', value: this.horizontalSpeed };
};
GpuMuellerGdc2008Water.prototype.calculateSubsteps = function (dt) {
    return Math.ceil(1.5 * dt / this.maxDt);  //not always stable without a multiplier (using 1.5 now)
};

/**
 * GPU height field water simulation based on HelloWorld code of "Fast Water Simulation for Games Using Height Fields" (Matthias Mueller-Fisher, GDC2008)
 * @constructor
 * @extends {GpuHeightFieldWater}
 */
function GpuMuellerGdc2008HwWater(options) {
    GpuHeightFieldWater.call(this, options);
}
//inherit
GpuMuellerGdc2008HwWater.prototype = Object.create(GpuHeightFieldWater.prototype);
GpuMuellerGdc2008HwWater.prototype.constructor = GpuMuellerGdc2008HwWater;
//override
GpuMuellerGdc2008HwWater.prototype.getWaterFragmentShaderUrl = function () {
    return '/glsl/hfWater_muellerGdc2008Hw.frag';
};

/**
 * GPU height field water simulation based on http://freespace.virgin.net/hugo.elias/graphics/x_water.htm
 * @constructor
 * @extends {GpuHeightFieldWater}
 */
function GpuXWater(options) {
    GpuHeightFieldWater.call(this, options);
}
//inherit
GpuXWater.prototype = Object.create(GpuHeightFieldWater.prototype);
GpuXWater.prototype.constructor = GpuXWater;
//override
GpuXWater.prototype.getWaterFragmentShaderUrl = function () {
    return '/glsl/hfWater_xWater.frag';
};

/**
 * GPU height field water simulation based on "Interactive Water Surfaces" (Jerry Tessendorf, Game Programming Gems 4)
 * @constructor
 * @extends {GpuHeightFieldWater}
 */
function GpuTessendorfIWaveWater(options) {

    //not giving user the choice of kernel size.
    //wanted to use 6 as recommended, but that doesn't work well with mesh res of 256 (ripples look like they go inwards rather than outwards).
    //radius of 2 seems to work ok for mesh 256.
    this.kernelRadius = 2;

    GpuHeightFieldWater.call(this, options);

    this.__loadKernelTexture();
}
//inherit
GpuTessendorfIWaveWater.prototype = Object.create(GpuHeightFieldWater.prototype);
GpuTessendorfIWaveWater.prototype.constructor = GpuTessendorfIWaveWater;
//override
GpuTessendorfIWaveWater.prototype.getWaterFragmentShaderUrl = function () {
    return '/glsl/hfWater_tessendorfIWave.frag';
};
GpuTessendorfIWaveWater.prototype.__setupShaders = function () {

    GpuHeightFieldWater.prototype.__setupShaders.call(this);

    THREE.ShaderManager.addShader('/glsl/hfWater_tessendorfIWave_convolve.frag');
    this.convolveMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uWaterTexture: { type: 't', value: this.emptyTexture },
            uTexelSize: { type: 'v2', value: new THREE.Vector2(this.texelSize, this.texelSize) },
            uKernel: { type: "fv1", value: this.kernelData }
        },
        vertexShader: THREE.ShaderManager.getShaderContents('/glsl/passUv.vert'),
        fragmentShader: THREE.ShaderManager.getShaderContents('/glsl/hfWater_tessendorfIWave_convolve.frag')
    });

    this.waterSimMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uWaterTexture: { type: 't', value: this.emptyTexture },
            uTwoMinusDampTimesDt: { type: 'f', value: 0.0 },
            uOnePlusDampTimesDt: { type: 'f', value: 0.0 },
            uGravityTimesDtTimesDt: { type: 'f', value: 0.0 },
            uMeanHeight: { type: 'f', value: this.meanHeight }
        },
        vertexShader: THREE.ShaderManager.getShaderContents('/glsl/passUv.vert'),
        fragmentShader: THREE.ShaderManager.getShaderContents(this.getWaterFragmentShaderUrl())
    });
};
GpuTessendorfIWaveWater.prototype.waterSimPass = function (substepDt) {

    //convolve
    this.rttQuadMesh.material = this.convolveMaterial;
    this.convolveMaterial.uniforms['uWaterTexture'].value = this.rttRenderTarget2;
    this.convolveMaterial.uniforms['uKernel'].value = this.kernelData;
    this.renderer.render(this.rttScene, this.rttCamera, this.rttRenderTarget1, false);
    this.swapRenderTargets();

    //water sim
    this.rttQuadMesh.material = this.waterSimMaterial;
    this.waterSimMaterial.uniforms['uWaterTexture'].value = this.rttRenderTarget2;
    this.waterSimMaterial.uniforms['uTwoMinusDampTimesDt'].value = 2.0 - this.dampingFactor * substepDt;
    this.waterSimMaterial.uniforms['uOnePlusDampTimesDt'].value = 1.0 + this.dampingFactor * substepDt;
    this.waterSimMaterial.uniforms['uGravityTimesDtTimesDt'].value = -this.gravity * substepDt * substepDt;
    this.waterSimMaterial.uniforms['uMeanHeight'].value = this.meanHeight;
    this.renderer.render(this.rttScene, this.rttCamera, this.rttRenderTarget1, false);
    this.swapRenderTargets();

};
//methods
GpuTessendorfIWaveWater.prototype.__loadKernelTexture = function () {

    //load this.G from json file
    var url = '/python/iWave_kernels_' + this.kernelRadius + '.json';
    var that = this;
    $.ajax({
        url: url,
        async: false
    }).done(function (data) {
        that.G = data;
    }).error(function (xhr, textStatus, error) {
        throw new Error('error loading ' + url + ': ' + error);
    });

    //create a data texture from G
    var twoTimesKernelPlusOne = 2 * this.kernelRadius + 1;
    this.kernelData = new Float32Array(twoTimesKernelPlusOne * twoTimesKernelPlusOne);
    var idxX, idxY, idx, value, y;
    for (idxY in this.G) {
        if (this.G.hasOwnProperty(idxY)) {
            y = this.G[idxY];
            for (idxX in y) {
                if (y.hasOwnProperty(idxX)) {
                    value = y[idxX];
                    idx = (parseInt(idxY, 10) + this.kernelRadius) * twoTimesKernelPlusOne + (parseInt(idxX, 10) + this.kernelRadius);
                    this.kernelData[idx] = value;
                }
            }
        }
    }

};


/**
 * GPU height field water based on the hydrostatic pipe model
 * @constructor
 * @extends {GpuHeightFieldWater}
 */
function GpuPipeModelWater(options) {

    this.minWaterHeight = -0.05;
    this.initialWaterHeight = options.initialWaterHeight || 0.0;
    this.initialWaterHeight += this.minWaterHeight;

    GpuHeightFieldWater.call(this, options);

    this.terrainTexture = options.terrainTexture || this.emptyTexture;

    //some constants
    this.atmosPressure = 0;  //assume one constant atmos pressure throughout
    this.pipeLength = this.segmentSize;
    this.pipeCrossSectionArea = this.pipeLength * this.pipeLength;  //square cross-section area
    this.pipeCrossSectionArea *= this.res / 10;  //scale according to resolution
    this.heightToFluxFactorNoDt = this.pipeCrossSectionArea * this.gravity / this.pipeLength;

    this.maxHorizontalSpeed = 10.0;  //just an arbitrary upper-bound estimate //TODO: link this to cross-section area
    this.maxDt = this.segmentSize / this.maxHorizontalSpeed;  //based on CFL condition

}
//inherit
GpuPipeModelWater.prototype = Object.create(GpuHeightFieldWater.prototype);
GpuPipeModelWater.prototype.constructor = GpuPipeModelWater;
//override
GpuPipeModelWater.prototype.getWaterFragmentShaderUrl = function () {
    return '/glsl/hfWater_pipeModel.frag';
};
GpuPipeModelWater.prototype.__setupShaders = function () {

    GpuHeightFieldWater.prototype.__setupShaders.call(this);

    THREE.ShaderManager.addShader('/glsl/hfWater_pipeModel_calcFlux.frag');
    this.waterSimMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTerrainTexture: { type: 't', value: this.emptyTexture },
            uWaterTexture: { type: 't', value: this.emptyTexture },
            uFluxTexture: { type: 't', value: this.emptyTexture },
            uStaticObstaclesTexture: { type: 't', value: this.emptyTexture },
            uBoundaryTexture: { type: 't', value: this.emptyTexture },
            uTexelSize: { type: 'v2', value: new THREE.Vector2(this.texelSize, this.texelSize) },
            uDampingFactor: { type: 'f', value: this.__dampingFactor },
            uHeightToFluxFactor: { type: 'f', value: 0.0 },
            uSegmentSizeSquared: { type: 'f', value: this.segmentSizeSquared },
            uDt: { type: 'f', value: 0.0 },
            uMinWaterHeight: { type: 'f', value: this.minWaterHeight }
        },
        vertexShader: THREE.ShaderManager.getShaderContents('/glsl/passUv.vert'),
        fragmentShader: THREE.ShaderManager.getShaderContents('/glsl/hfWater_pipeModel_calcFlux.frag')
    });

    this.waterSimMaterial2 = new THREE.ShaderMaterial({
        uniforms: {
            uWaterTexture: { type: 't', value: this.emptyTexture },
            uFluxTexture: { type: 't', value: this.emptyTexture },
            uTexelSize: { type: 'v2', value: new THREE.Vector2(this.texelSize, this.texelSize) },
            uSegmentSize: { type: 'f', value: this.segmentSize },
            uDt: { type: 'f', value: 0.0 },
            uMinWaterHeight: { type: 'f', value: this.minWaterHeight }
        },
        vertexShader: THREE.ShaderManager.getShaderContents('/glsl/passUv.vert'),
        fragmentShader: THREE.ShaderManager.getShaderContents(this.getWaterFragmentShaderUrl())
    });

    THREE.ShaderManager.addShader('/glsl/setColor.frag');
    this.clearMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uColor: { type: 'v4', value: new THREE.Vector4(this.initialWaterHeight, this.initialWaterHeight, this.initialWaterHeight, this.initialWaterHeight) }
        },
        vertexShader: THREE.ShaderManager.getShaderContents('/glsl/passUv.vert'),
        fragmentShader: THREE.ShaderManager.getShaderContents('/glsl/setColor.frag')
    });

    THREE.ShaderManager.addShader('/glsl/calcFinalWaterHeight.frag');
    this.calcFinalWaterHeightMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTerrainTexture: { type: 't', value: this.emptyTexture },
            uStaticObstaclesTexture: { type: 't', value: this.emptyTexture },
            uWaterTexture: { type: 't', value: this.emptyTexture },
            uMultiplyTexture: { type: 't', value: this.emptyTexture },
            uMaskOffset: { type: 'f', value: this.minWaterHeight }
        },
        vertexShader: THREE.ShaderManager.getShaderContents('/glsl/passUv.vert'),
        fragmentShader: THREE.ShaderManager.getShaderContents('/glsl/calcFinalWaterHeight.frag')
    });

    //add flood uniforms into disturb material
    this.disturbAndSourceMaterial.uniforms['uUseObstacleTexture'].value = false;
    this.disturbAndSourceMaterial.uniforms.uIsFlooding = { type: 'i', value: 0 };
    this.disturbAndSourceMaterial.uniforms.uFloodAmount = { type: 'f', value: this.floodAmount };
};
GpuPipeModelWater.prototype.__setupRttScene = function () {

    GpuHeightFieldWater.prototype.__setupRttScene.call(this);

    //create RTT render targets for flux (we need two to do feedback)
    this.rttRenderTargetFlux1 = new THREE.WebGLRenderTarget(this.res, this.res, this.linearFloatRGBAParams);
    this.rttRenderTargetFlux1.generateMipmaps = false;
    this.rttRenderTargetFlux2 = this.rttRenderTargetFlux1.clone();

    //create another RTT render target for storing the combined terrain + water heights
    this.rttCombinedHeight = this.rttRenderTarget1.clone();
};
/**
 * Source into the water simulation
 * @param  {THREE.Vector3} position World-space position to source at
 * @param  {number} amount Amount of water to source
 * @param  {number} radius Radius of water to source
 */
GpuPipeModelWater.prototype.source = function (position, amount, radius) {
    this.isSourcing = true;
    this.sourceUvPos.x = (position.x + this.halfSize) / this.size;
    this.sourceUvPos.y = (position.z + this.halfSize) / this.size;
    this.sourceAmount = amount;
    this.sourceRadius = radius;
};
/**
 * Flood the scene by the given volume
 * @param  {number} volume Volume of water to flood the scene with
 */
GpuPipeModelWater.prototype.flood = function (volume) {
    this.isFlooding = true;
    this.floodAmount = volume / (this.size * this.size);
};
GpuPipeModelWater.prototype.disturbPass = function () {
    var shouldRender = false;
    if (this.disturbMapHasUpdated) {
        this.rttQuadMesh.material = this.disturbAndSourceMaterial;
        this.disturbAndSourceMaterial.uniforms['uTexture'].value = this.rttRenderTarget2;
        // this.disturbAndSourceMaterial.uniforms['uStaticObstaclesTexture'].value = this.rttDynObstaclesRenderTarget;
        this.disturbAndSourceMaterial.uniforms['uDisturbTexture'].value = this.rttDisturbMapRenderTarget;
        shouldRender = true;
    }
    if (this.isDisturbing) {
        this.rttQuadMesh.material = this.disturbAndSourceMaterial;
        this.disturbAndSourceMaterial.uniforms['uTexture'].value = this.rttRenderTarget2;
        this.disturbAndSourceMaterial.uniforms['uIsDisturbing'].value = this.isDisturbing;
        this.disturbAndSourceMaterial.uniforms['uDisturbPos'].value.copy(this.disturbUvPos);
        this.disturbAndSourceMaterial.uniforms['uDisturbAmount'].value = this.disturbAmount;
        this.disturbAndSourceMaterial.uniforms['uDisturbRadius'].value = this.disturbRadius / this.size;
        shouldRender = true;
    }
    if (this.isSourcing) {
        this.rttQuadMesh.material = this.disturbAndSourceMaterial;
        this.disturbAndSourceMaterial.uniforms['uTexture'].value = this.rttRenderTarget2;
        this.disturbAndSourceMaterial.uniforms['uIsSourcing'].value = this.isSourcing;
        this.disturbAndSourceMaterial.uniforms['uSourcePos'].value.copy(this.sourceUvPos);
        this.disturbAndSourceMaterial.uniforms['uSourceAmount'].value = this.sourceAmount;
        this.disturbAndSourceMaterial.uniforms['uSourceRadius'].value = this.sourceRadius / this.size;
        shouldRender = true;
    }
    if (this.isFlooding) {
        this.rttQuadMesh.material = this.disturbAndSourceMaterial;
        this.disturbAndSourceMaterial.uniforms['uTexture'].value = this.rttRenderTarget2;
        this.disturbAndSourceMaterial.uniforms['uIsFlooding'].value = this.isFlooding;
        this.disturbAndSourceMaterial.uniforms['uFloodAmount'].value = this.floodAmount;
        shouldRender = true;
    }
    if (shouldRender) {
        this.renderer.render(this.rttScene, this.rttCamera, this.rttRenderTarget1, false);
        this.swapRenderTargets();

        this.disturbMapHasUpdated = false;
        this.disturbAndSourceMaterial.uniforms['uDisturbTexture'].value = this.emptyTexture;
        this.isDisturbing = false;
        this.disturbAndSourceMaterial.uniforms['uIsDisturbing'].value = false;
        this.isSourcing = false;
        this.disturbAndSourceMaterial.uniforms['uIsSourcing'].value = false;
        this.isFlooding = false;
        this.disturbAndSourceMaterial.uniforms['uIsFlooding'].value = false;
    }
};
GpuPipeModelWater.prototype.calculateSubsteps = function (dt) {
    return Math.ceil(5.0 * dt / this.maxDt);  //not always stable without a multiplier
};
GpuPipeModelWater.prototype.resetPass = function () {
    //init rttRenderTarget2 to initial height value
    this.rttQuadMesh.material = this.clearMaterial;
    this.clearMaterial.uniforms['uColor'].value.set(this.initialWaterHeight, this.initialWaterHeight, this.initialWaterHeight, this.initialWaterHeight);
    this.renderer.render(this.rttScene, this.rttCamera, this.rttRenderTarget2, false);

    //init all channels of flux texture to 0.0
    this.clearMaterial.uniforms['uColor'].value.set(0.0, 0.0, 0.0, 0.0);
    this.renderer.render(this.rttScene, this.rttCamera, this.rttRenderTargetFlux2, false);
};
GpuPipeModelWater.prototype.waterSimPass = function (substepDt) {

    //calculate flux
    this.rttQuadMesh.material = this.waterSimMaterial;
    this.waterSimMaterial.uniforms['uTerrainTexture'].value = this.terrainTexture;
    this.waterSimMaterial.uniforms['uWaterTexture'].value = this.rttRenderTarget2;
    this.waterSimMaterial.uniforms['uFluxTexture'].value = this.rttRenderTargetFlux2;
    this.waterSimMaterial.uniforms['uStaticObstaclesTexture'].value = this.rttStaticObstaclesRenderTarget;
    this.waterSimMaterial.uniforms['uBoundaryTexture'].value = this.boundaryTexture;
    this.waterSimMaterial.uniforms['uHeightToFluxFactor'].value = this.heightToFluxFactorNoDt * substepDt;
    this.waterSimMaterial.uniforms['uDt'].value = substepDt;
    this.renderer.render(this.rttScene, this.rttCamera, this.rttRenderTargetFlux1, false);
    this.swapFluxRenderTargets();

    //water sim
    this.rttQuadMesh.material = this.waterSimMaterial2;
    this.waterSimMaterial2.uniforms['uWaterTexture'].value = this.rttRenderTarget2;
    this.waterSimMaterial2.uniforms['uFluxTexture'].value = this.rttRenderTargetFlux2;
    this.waterSimMaterial2.uniforms['uDt'].value = substepDt;
    this.renderer.render(this.rttScene, this.rttCamera, this.rttRenderTarget1, false);
    this.swapRenderTargets();

};
GpuPipeModelWater.prototype.postStepPass = function () {

    //combine terrain, static obstacle and water heights
    this.rttQuadMesh.material = this.calcFinalWaterHeightMaterial;
    this.calcFinalWaterHeightMaterial.uniforms['uTerrainTexture'].value = this.terrainTexture;
    this.calcFinalWaterHeightMaterial.uniforms['uStaticObstaclesTexture'].value = this.rttStaticObstaclesRenderTarget;
    this.calcFinalWaterHeightMaterial.uniforms['uWaterTexture'].value = this.rttRenderTarget2;
    this.calcFinalWaterHeightMaterial.uniforms['uMultiplyTexture'].value = this.boundaryTexture;
    this.renderer.render(this.rttScene, this.rttCamera, this.rttCombinedHeight, false);

    //rebind render target to water mesh to ensure vertex shader gets the right texture
    this.mesh.material.uniforms['uTexture'].value = this.rttCombinedHeight;
};
GpuPipeModelWater.prototype.swapFluxRenderTargets = function () {
    var temp = this.rttRenderTargetFlux1;
    this.rttRenderTargetFlux1 = this.rttRenderTargetFlux2;
    this.rttRenderTargetFlux2 = temp;
    // this.rttQuadMesh.material.uniforms['uTexture'].value = this.rttRenderTargetFlux2;
};