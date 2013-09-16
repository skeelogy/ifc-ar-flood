//Fragment shader to accumulate an obstacle texture
//author: Skeel Lee <skeel@skeelogy.com>

uniform sampler2D uObstaclesTexture;
uniform sampler2D uObstacleTopTexture;
uniform sampler2D uObstacleBottomTexture;
uniform sampler2D uWaterTexture;
uniform sampler2D uTerrainTexture;

uniform float uHalfRange;

varying vec2 vUv;

void main() {

    //r channel: whether in obstacle or not

    //read texture from previous step
    vec4 t = texture2D(uObstaclesTexture, vUv);

    //read texture for obstacle
    vec4 tTop = texture2D(uObstacleTopTexture, vUv);
    vec4 tBottom = texture2D(uObstacleBottomTexture, vec2(vUv.x, 1.0-vUv.y));

    //read texture for water and terrain
    vec4 tWater = texture2D(uWaterTexture, vUv);
    vec4 tTerrain = texture2D(uTerrainTexture, vUv);
    float waterHeight = tWater.r + tTerrain.r;

    //compare the top and bottom depths to determine if water is in obstacle
    t.r = (float(tBottom.r < uHalfRange + waterHeight) * tBottom.a) * (float(tTop.r < uHalfRange - waterHeight) * tTop.a);

    //write out to texture for next step
    gl_FragColor = vec4(t.r, 0, 0, 1);
}