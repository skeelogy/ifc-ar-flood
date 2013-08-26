/**
 * @fileOverview GPU height field water simulations for Three.js flat planes
 * @author Skeel Lee <skeel@skeelogy.com>
 * @version 0.1.0
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
            this.waterSimMaterial.uniforms.uDampingFactor.value = value;
        }
    });

    //number of full steps to take per frame, to speed up some of algorithms that are slow to propagate at high mesh resolutions.
    //this is different from substeps which are reduces dt per step for stability.
    this.multisteps = options.multisteps || 1;

    this.meanHeight = options.meanHeight || 0;

    this.gravity = 9.81;

    this.halfSize = this.size / 2.0;
    this.segmentSize = this.size / this.res;
    this.segmentSizeSquared = this.segmentSize * this.segmentSize;
    this.texelSize = 1.0 / this.res;

    this.isDisturbing = false;
    this.disturbUvPos = new THREE.Vector2();
    this.disturbAmount = 0;
    this.disturbRadius = 0.0025 * this.size;
    this.isSourcing = false;
    this.sourceUvPos = new THREE.Vector2();
    this.sourceAmount = 0;
    this.sourceRadius = 0.0025 * this.size;

    this.linearFloatParams = {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
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
    this.emptyTexture = new THREE.WebGLRenderTarget(this.res, this.res, this.linearFloatParams);
    this.emptyTexture.generateMipmaps = false;

    this.__initCounter = 5;
    this.init();
}
/**
 * Initializes the sim
 */
GpuHeightFieldWater.prototype.init = function () {
    this.__checkExtensions();
    this.__setupShaders();
    this.__setupRttScene();
    this.__setupVtf();
    this.__initDataAndTextures();
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

    THREE.ShaderManager.addShader('/glsl/clear.frag');
    this.resetMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uColor: { type: 'v4', value: new THREE.Vector4() }
        },
        vertexShader: THREE.ShaderManager.getShaderContents('/glsl/passUv.vert'),
        fragmentShader: THREE.ShaderManager.getShaderContents('/glsl/clear.frag')
    });

};
/**
 * Sets up the render-to-texture scene (2 render targets by default)
 */
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
    this.rttRenderTarget1 = new THREE.WebGLRenderTarget(this.res, this.res, this.linearFloatParams);
    this.rttRenderTarget1.generateMipmaps = false;
    this.rttRenderTarget2 = this.rttRenderTarget1.clone();
};
/**
 * Sets up the vertex-texture-fetch for the given mesh
 */
GpuHeightFieldWater.prototype.__setupVtf = function () {
    THREE.ShaderManager.addShader('/glsl/heightMap.vert');
    THREE.ShaderManager.addShader('/glsl/lambert.frag');
    this.mesh.material = new THREE.ShaderMaterial({
        uniforms: {
            uTexture: { type: 't', value: this.rttRenderTarget1 },
            uTexelSize: { type: 'v2', value: new THREE.Vector2(this.texelSize, this.texelSize) },
            uTexelWorldSize: { type: 'v2', value: new THREE.Vector2(this.segmentSize, this.segmentSize) },
            uHeightMultiplier: { type: 'f', value: 1.0 },
            uBaseColor: { type: 'v3', value: new THREE.Vector3(0.2, 0.8, 1) },
            uAmbientLightColor: { type: 'v3', value: new THREE.Vector3(1, 1, 1) },
            uAmbientLightIntensity: { type: 'f', value: 0.1 },
            uPointLight1WorldPos: { type: 'v3', value: new THREE.Vector3(2, 2, 2) },
            uPointLight1Color: { type: 'v3', value: new THREE.Vector3(1, 1, 1) },
            uPointLight1Intensity: { type: 'f', value: 0.5 },
            uPointLight1FalloffStart: { type: 'f', value: 1.0 },
            uPointLight1FalloffEnd: { type: 'f', value: 10.0 }
        },
        vertexShader: THREE.ShaderManager.getShaderContents('/glsl/heightMap.vert'),
        fragmentShader: THREE.ShaderManager.getShaderContents('/glsl/lambert.frag')
    });
};
/**
 * Checks for WebGL extensions. Checks for OES_texture_float_linear and vertex texture fetch capability by default.
 */
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
GpuHeightFieldWater.prototype.reset = function () {
    this.__initCounter = 5;
};
GpuHeightFieldWater.prototype.resetPass = function () {
    //reset height in main render target
    this.rttQuadMesh.material = this.resetMaterial;
    this.resetMaterial.uniforms.uColor.value.set(this.meanHeight, 0, 0, this.meanHeight);
    this.renderer.render(this.rttScene, this.rttCamera, this.rttRenderTarget2, false);
    this.swapRenderTargets();
};
GpuHeightFieldWater.prototype.disturb = function (position, amount, radius) {
    this.isDisturbing = true;
    this.disturbUvPos.x = (position.x + this.halfSize) / this.size;
    this.disturbUvPos.y = (position.z + this.halfSize) / this.size;
    this.disturbAmount = amount;
    this.disturbRadius = radius;
};
GpuHeightFieldWater.prototype.disturbPass = function () {
    if (this.isDisturbing) {
        this.rttQuadMesh.material = this.disturbAndSourceMaterial;
        this.disturbAndSourceMaterial.uniforms.uTexture.value = this.rttRenderTarget2;
        this.disturbAndSourceMaterial.uniforms.uIsDisturbing.value = this.isDisturbing;
        this.disturbAndSourceMaterial.uniforms.uDisturbPos.value.copy(this.disturbUvPos);
        this.disturbAndSourceMaterial.uniforms.uDisturbAmount.value = this.disturbAmount;
        this.disturbAndSourceMaterial.uniforms.uDisturbRadius.value = this.disturbRadius / this.size;

        this.renderer.render(this.rttScene, this.rttCamera, this.rttRenderTarget1, false);
        this.swapRenderTargets();

        this.isDisturbing = false;
        this.rttQuadMesh.material.uniforms.uIsDisturbing.value = false;
    }
};
GpuHeightFieldWater.prototype.waterSimPass = function (substepDt) {
    this.rttQuadMesh.material = this.waterSimMaterial;
    this.waterSimMaterial.uniforms.uTexture.value = this.rttRenderTarget2;
    this.waterSimMaterial.uniforms.uDt.value = substepDt;
    this.waterSimMaterial.uniforms.uMeanHeight.value = this.meanHeight;
    this.renderer.render(this.rttScene, this.rttCamera, this.rttRenderTarget1, false);
    this.swapRenderTargets();
};
GpuHeightFieldWater.prototype.calculateSubsteps = function (dt) {
    return 1;
};
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

    //do multiple full steps per frame to speed up some of algorithms that are slow to propagate at high mesh resolutions
    var i;
    for (i = 0; i < this.multisteps; i++) {
        this.step(dt);
    }

    //post step
    this.postStepPass();
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
    this.mesh.material.uniforms.uTexture.value = this.rttRenderTarget1;
};
GpuHeightFieldWater.prototype.swapRenderTargets = function () {
    var temp = this.rttRenderTarget1;
    this.rttRenderTarget1 = this.rttRenderTarget2;
    this.rttRenderTarget2 = temp;
    // this.rttQuadMesh.material.uniforms.uTexture.value = this.rttRenderTarget2;
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
    this.convolveMaterial.uniforms.uWaterTexture.value = this.rttRenderTarget2;
    this.convolveMaterial.uniforms.uKernel.value = this.kernelData;
    this.renderer.render(this.rttScene, this.rttCamera, this.rttRenderTarget1, false);
    this.swapRenderTargets();

    //water sim
    this.rttQuadMesh.material = this.waterSimMaterial;
    this.waterSimMaterial.uniforms.uWaterTexture.value = this.rttRenderTarget2;
    this.waterSimMaterial.uniforms.uTwoMinusDampTimesDt.value = 2.0 - this.dampingFactor * substepDt;
    this.waterSimMaterial.uniforms.uOnePlusDampTimesDt.value = 1.0 + this.dampingFactor * substepDt;
    this.waterSimMaterial.uniforms.uGravityTimesDtTimesDt.value = -this.gravity * substepDt * substepDt;
    this.waterSimMaterial.uniforms.uMeanHeight.value = this.meanHeight;
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
            for (idxX in this.G[idxY]) {
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
    this.density = 1;
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
            uSegmentSizeSquared: { type: 'f', value: this.segmentSizeSquared },
            uDt: { type: 'f', value: 0.0 },
            uMinWaterHeight: { type: 'f', value: this.minWaterHeight }
        },
        vertexShader: THREE.ShaderManager.getShaderContents('/glsl/passUv.vert'),
        fragmentShader: THREE.ShaderManager.getShaderContents(this.getWaterFragmentShaderUrl())
    });

    THREE.ShaderManager.addShader('/glsl/clear.frag');
    this.clearMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uColor: { type: 'v4', value: new THREE.Vector4(this.initialWaterHeight, this.initialWaterHeight, this.initialWaterHeight, this.initialWaterHeight) }
        },
        vertexShader: THREE.ShaderManager.getShaderContents('/glsl/passUv.vert'),
        fragmentShader: THREE.ShaderManager.getShaderContents('/glsl/clear.frag')
    });

    THREE.ShaderManager.addShader('/glsl/combineTexturesPostMult.frag');
    this.combineTexturesMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTexture1: { type: 't', value: this.emptyTexture },
            uTexture2: { type: 't', value: this.emptyTexture },
            uMultiplyTexture: { type: 't', value: this.emptyTexture },
            uMaskOffset: { type: 'f', value: this.minWaterHeight }
        },
        vertexShader: THREE.ShaderManager.getShaderContents('/glsl/passUv.vert'),
        fragmentShader: THREE.ShaderManager.getShaderContents('/glsl/combineTexturesPostMult.frag')
    });

};
GpuPipeModelWater.prototype.__setupRttScene = function () {

    GpuHeightFieldWater.prototype.__setupRttScene.call(this);

    //create RTT render targets for flux (we need two to do feedback)
    this.rttRenderTargetFlux1 = new THREE.WebGLRenderTarget(this.res, this.res, this.linearFloatParams);
    this.rttRenderTargetFlux1.generateMipmaps = false;
    this.rttRenderTargetFlux2 = this.rttRenderTargetFlux1.clone();

    //create another RTT render target for storing the combined terrain + water heights
    this.rttCombinedHeight = this.rttRenderTarget1.clone();
};
GpuPipeModelWater.prototype.source = function (position, amount, radius) {
    this.isSourcing = true;
    this.sourceUvPos.x = (position.x + this.halfSize) / this.size;
    this.sourceUvPos.y = (position.z + this.halfSize) / this.size;
    this.sourceAmount = amount;
    this.sourceRadius = radius;
};
GpuPipeModelWater.prototype.disturbPass = function () {
    var shouldRender = false;
    if (this.isDisturbing) {
        this.rttQuadMesh.material = this.disturbAndSourceMaterial;
        this.disturbAndSourceMaterial.uniforms.uTexture.value = this.rttRenderTarget2;
        this.disturbAndSourceMaterial.uniforms.uIsDisturbing.value = this.isDisturbing;
        this.disturbAndSourceMaterial.uniforms.uDisturbPos.value.copy(this.disturbUvPos);
        this.disturbAndSourceMaterial.uniforms.uDisturbAmount.value = this.disturbAmount;
        this.disturbAndSourceMaterial.uniforms.uDisturbRadius.value = this.disturbRadius / this.size;
        shouldRender = true;
    }
    if (this.isSourcing) {
        this.rttQuadMesh.material = this.disturbAndSourceMaterial;
        this.disturbAndSourceMaterial.uniforms.uTexture.value = this.rttRenderTarget2;
        this.disturbAndSourceMaterial.uniforms.uIsSourcing.value = this.isSourcing;
        this.disturbAndSourceMaterial.uniforms.uSourcePos.value.copy(this.sourceUvPos);
        this.disturbAndSourceMaterial.uniforms.uSourceAmount.value = this.sourceAmount;
        this.disturbAndSourceMaterial.uniforms.uSourceRadius.value = this.sourceRadius / this.size;
        shouldRender = true;
    }
    if (shouldRender) {
        this.renderer.render(this.rttScene, this.rttCamera, this.rttRenderTarget1, false);
        this.swapRenderTargets();

        this.isDisturbing = false;
        this.rttQuadMesh.material.uniforms.uIsDisturbing.value = false;
        this.isSourcing = false;
        this.rttQuadMesh.material.uniforms.uIsSourcing.value = false;
    }
};
GpuPipeModelWater.prototype.calculateSubsteps = function (dt) {
    return Math.ceil(5.0 * dt / this.maxDt);  //not always stable without a multiplier
};
GpuPipeModelWater.prototype.resetPass = function () {
    //init rttRenderTarget2 to initial height value
    this.rttQuadMesh.material = this.clearMaterial;
    this.clearMaterial.uniforms.uColor.value.set(this.initialWaterHeight, this.initialWaterHeight, this.initialWaterHeight, this.initialWaterHeight);
    this.renderer.render(this.rttScene, this.rttCamera, this.rttRenderTarget2, false);

    //init all channels of flux texture to 0.0
    this.clearMaterial.uniforms.uColor.value.set(0.0, 0.0, 0.0, 0.0);
    this.renderer.render(this.rttScene, this.rttCamera, this.rttRenderTargetFlux2, false);
}
GpuPipeModelWater.prototype.waterSimPass = function (substepDt) {

    //calculate flux
    this.rttQuadMesh.material = this.waterSimMaterial;
    this.waterSimMaterial.uniforms.uTerrainTexture.value = this.terrainTexture;
    this.waterSimMaterial.uniforms.uWaterTexture.value = this.rttRenderTarget2;
    this.waterSimMaterial.uniforms.uFluxTexture.value = this.rttRenderTargetFlux2;
    this.waterSimMaterial.uniforms.uBoundaryTexture.value = this.boundaryTexture;
    this.waterSimMaterial.uniforms.uHeightToFluxFactor.value = this.heightToFluxFactorNoDt * substepDt;
    this.waterSimMaterial.uniforms.uDt.value = substepDt;
    this.renderer.render(this.rttScene, this.rttCamera, this.rttRenderTargetFlux1, false);
    this.swapFluxRenderTargets();

    //water sim
    this.rttQuadMesh.material = this.waterSimMaterial2;
    this.waterSimMaterial2.uniforms.uWaterTexture.value = this.rttRenderTarget2;
    this.waterSimMaterial2.uniforms.uFluxTexture.value = this.rttRenderTargetFlux2;
    this.waterSimMaterial2.uniforms.uDt.value = substepDt;
    this.renderer.render(this.rttScene, this.rttCamera, this.rttRenderTarget1, false);
    this.swapRenderTargets();

};
GpuPipeModelWater.prototype.postStepPass = function () {

    //combine terrain and water heights
    this.rttQuadMesh.material = this.combineTexturesMaterial;
    this.combineTexturesMaterial.uniforms.uTexture1.value = this.terrainTexture;
    this.combineTexturesMaterial.uniforms.uTexture2.value = this.rttRenderTarget2;
    this.combineTexturesMaterial.uniforms.uMultiplyTexture.value = this.boundaryTexture;
    this.renderer.render(this.rttScene, this.rttCamera, this.rttCombinedHeight, false);

    //rebind render target to water mesh to ensure vertex shader gets the right texture
    this.mesh.material.uniforms.uTexture.value = this.rttCombinedHeight;
};
GpuPipeModelWater.prototype.swapFluxRenderTargets = function () {
    var temp = this.rttRenderTargetFlux1;
    this.rttRenderTargetFlux1 = this.rttRenderTargetFlux2;
    this.rttRenderTargetFlux2 = temp;
    // this.rttQuadMesh.material.uniforms.uTexture.value = this.rttRenderTargetFlux2;
};