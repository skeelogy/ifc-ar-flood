/**
 * @fileOverview GPU JavaScript/GLSL height field water simulations for Three.js flat planes
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
        this.waterSimMaterial.uniforms.uDampingFactor.value = value;
    });

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

    //create an empty texture because the default value of textures does not seem to be 0?
    this.emptyTexture = new THREE.WebGLRenderTarget(this.res, this.res, this.linearFloatParams);
    this.emptyTexture.generateMipmaps = false;

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
};
GpuHeightFieldWater.prototype.getWaterFragmentShaderUrl = function () {
    throw new Error('Abstract method not implemented');
};
GpuHeightFieldWater.prototype.__setupShaders = function () {

    THREE.ShaderManager.addShader('/glsl/passUv.vert');
    THREE.ShaderManager.addShader('/glsl/hfWater_disturb.frag');
    THREE.ShaderManager.addShader(this.getWaterFragmentShaderUrl());
    THREE.ShaderManager.addShader('/glsl/heightMap.vert');
    THREE.ShaderManager.addShader('/glsl/lambert.frag');

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

    this.waterSimMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTexture: { type: 't', value: this.emptyTexture },
            uTexelSize: { type: 'v2', value: new THREE.Vector2(this.texelSize, this.texelSize) },
            uTexelWorldSize: { type: 'v2', value: new THREE.Vector2(this.size / this.res, this.size / this.res) },
            uDampingFactor: { type: 'f', value: this.__dampingFactor },
            uDt: { type: 'f', value: 0.0 }
        },
        vertexShader: THREE.ShaderManager.getShaderContents('/glsl/passUv.vert'),
        fragmentShader: THREE.ShaderManager.getShaderContents(this.getWaterFragmentShaderUrl())
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
    this.mesh.material = new THREE.ShaderMaterial({
        uniforms: {
            uTexture: { type: 't', value: this.rttRenderTarget1 },
            uTexelSize: { type: 'v2', value: new THREE.Vector2(this.texelSize, this.texelSize) },
            uTexelWorldSize: { type: 'v2', value: new THREE.Vector2(this.segmentSize, this.segmentSize) },
            uHeightMultiplier: { type: 'f', value: 1.0 },
            uBaseColor: { type: 'v3', value: new THREE.Vector3(0.2, 0.8, 1) },
            uAmbientLightColor: { type: 'v3', value: new THREE.Vector3(1, 1, 1) },
            uAmbientLightIntensity: { type: 'f', value: 0.1 },
            uPointLight1Pos: { type: 'v3', value: new THREE.Vector3(2, 2, 2) },
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
GpuHeightFieldWater.prototype.disturb = function (position, amount) {
    this.isDisturbing = true;
    this.disturbUvPos.x = (position.x + this.halfSize) / this.size;
    this.disturbUvPos.y = (position.z + this.halfSize) / this.size;
    this.disturbAmount = amount;
};
GpuHeightFieldWater.prototype.source = function (position, amount, radius) {
    this.isSourcing = true;
    this.sourceUvPos.x = (position.x + this.halfSize) / this.size;
    this.sourceUvPos.y = (position.z + this.halfSize) / this.size;
    this.sourceAmount = amount;
    this.sourceRadius = radius / this.size;
};
GpuHeightFieldWater.prototype.disturbAndSourcePass = function () {
    var shouldRender = false;
    if (this.isDisturbing) {
        this.rttQuadMesh.material = this.disturbAndSourceMaterial;
        this.disturbAndSourceMaterial.uniforms.uTexture.value = this.rttRenderTarget2;
        this.disturbAndSourceMaterial.uniforms.uIsDisturbing.value = this.isDisturbing;
        this.disturbAndSourceMaterial.uniforms.uDisturbPos.value.copy(this.disturbUvPos);
        this.disturbAndSourceMaterial.uniforms.uDisturbAmount.value = this.disturbAmount;
        shouldRender = true;
    }
    if (this.isSourcing) {
        this.rttQuadMesh.material = this.disturbAndSourceMaterial;
        this.disturbAndSourceMaterial.uniforms.uTexture.value = this.rttRenderTarget2;
        this.disturbAndSourceMaterial.uniforms.uIsSourcing.value = this.isSourcing;
        this.disturbAndSourceMaterial.uniforms.uSourcePos.value.copy(this.sourceUvPos);
        this.disturbAndSourceMaterial.uniforms.uSourceAmount.value = this.sourceAmount;
        this.disturbAndSourceMaterial.uniforms.uSourceRadius.value = this.sourceRadius;
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
GpuHeightFieldWater.prototype.waterSimPass = function (dt) {
    this.rttQuadMesh.material = this.waterSimMaterial;
    this.waterSimMaterial.uniforms.uTexture.value = this.rttRenderTarget2;
    this.waterSimMaterial.uniforms.uDt.value = dt;
    this.renderer.render(this.rttScene, this.rttCamera, this.rttRenderTarget1, false);
    this.swapRenderTargets();
};
GpuHeightFieldWater.prototype.update = function (dt) {

    //PASS 1: disturb
    this.disturbAndSourcePass();

    //PASS 2: water sim
    this.waterSimPass(dt);

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
GpuMuellerGdc2008Water.prototype.__setupRttScene = function () {
    GpuHeightFieldWater.prototype.__setupRttScene.call(this);

    //add uHorizontalSpeed into the uniforms
    this.waterSimMaterial.uniforms.uHorizontalSpeed = { type: 'f', value: this.horizontalSpeed };
};
GpuMuellerGdc2008Water.prototype.update = function (dt) {

    //fix dt for the moment (better to be in slow-mo in extreme cases than to explode)
    dt = 1.0 / 60.0;

    var substeps = Math.ceil(1.5 * dt / this.maxDt);  //not always stable without a multiplier (using 1.5 now)
    var substepDt = dt / substeps;

    //PASS 1: disturb
    this.disturbAndSourcePass();

    var i;
    for (i = 0; i < substeps; i++) {
        //PASS 2: water sim
        this.waterSimPass(substepDt);
    }

    //rebind render target to water mesh to ensure vertex shader gets the right texture
    this.mesh.material.uniforms.uTexture.value = this.rttRenderTarget1;
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
 * GPU height field water based on the hydrostatic pipe model
 * @constructor
 * @extends {GpuHeightFieldWater}
 */
function GpuPipeModelWater(options) {

    this.initialWaterHeight = options.initialWaterHeight || 0.0;

    this.minWaterHeight = -0.05;

    GpuHeightFieldWater.call(this, options);

    this.terrainTexture = options.terrainTexture || this.emptyTexture;

    //some constants
    this.gravity = 9.81;
    this.density = 1;
    this.atmosPressure = 0;  //assume one constant atmos pressure throughout
    this.pipeLength = this.segmentSize;
    this.pipeCrossSectionArea = this.pipeLength * this.pipeLength;  //square cross-section area
    this.heightToFluxFactorNoDt = this.pipeCrossSectionArea * this.gravity / this.pipeLength;

    this.maxHorizontalSpeed = 10.0;  //just an arbitrary upper-bound estimate //TODO: link this to cross-section area
    this.maxDt = this.segmentSize / this.maxHorizontalSpeed;  //based on CFL condition

    this.__initCounter = 5;
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
            uTerrainTexture: { type: 't', value: this.emptyTexture },
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

    THREE.ShaderManager.addShader('/glsl/combineTextures.frag');
    this.combineTexturesMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTexture1: { type: 't', value: this.emptyTexture },
            uTexture2: { type: 't', value: this.emptyTexture }
        },
        vertexShader: THREE.ShaderManager.getShaderContents('/glsl/passUv.vert'),
        fragmentShader: THREE.ShaderManager.getShaderContents('/glsl/combineTextures.frag')
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
GpuPipeModelWater.prototype.update = function (dt) {

    //NOTE: unable to figure out why this.terrainTexture has no data until a few updates later,
    //so using this dirty hack to init for the first few frames
    if (this.__initCounter > 0) {
        //init rttRenderTarget2 to initial height value
        this.rttQuadMesh.material = this.clearMaterial;
        this.renderer.render(this.rttScene, this.rttCamera, this.rttRenderTarget2, false);
        this.__initCounter -= 1;
        return;
    }

    //fix dt for the moment (better to be in slow-mo in extreme cases than to explode)
    dt = 1.0 / 60.0;

    //TODO: change back
    var substeps = 5; //Math.ceil(5.0 * dt / this.maxDt);  //not always stable without a multiplier
    var substepDt = dt / substeps;

    //PASS 1: disturb
    this.disturbAndSourcePass();

    var i;
    for (i = 0; i < substeps; i++) {

        //PASS 2: calculate flux
        this.rttQuadMesh.material = this.waterSimMaterial;
        this.waterSimMaterial.uniforms.uTerrainTexture.value = this.terrainTexture;
        this.waterSimMaterial.uniforms.uWaterTexture.value = this.rttRenderTarget2;
        this.waterSimMaterial.uniforms.uFluxTexture.value = this.rttRenderTargetFlux2;
        this.waterSimMaterial.uniforms.uHeightToFluxFactor.value = this.heightToFluxFactorNoDt * substepDt;
        this.waterSimMaterial.uniforms.uDt.value = substepDt;
        this.renderer.render(this.rttScene, this.rttCamera, this.rttRenderTargetFlux1, false);
        this.swapFluxRenderTargets();

        //PASS 3: water sim
        this.rttQuadMesh.material = this.waterSimMaterial2;
        this.waterSimMaterial2.uniforms.uTerrainTexture.value = this.terrainTexture;
        this.waterSimMaterial2.uniforms.uWaterTexture.value = this.rttRenderTarget2;
        this.waterSimMaterial2.uniforms.uFluxTexture.value = this.rttRenderTargetFlux2;
        this.waterSimMaterial2.uniforms.uDt.value = substepDt;
        this.renderer.render(this.rttScene, this.rttCamera, this.rttRenderTarget1, false);
        this.swapRenderTargets();

    }

    //combine terrain and water heights
    this.rttQuadMesh.material = this.combineTexturesMaterial;
    this.combineTexturesMaterial.uniforms.uTexture1.value = this.terrainTexture;
    this.combineTexturesMaterial.uniforms.uTexture2.value = this.rttRenderTarget2;
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