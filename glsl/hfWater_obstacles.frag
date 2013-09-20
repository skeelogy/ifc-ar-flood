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

    //read texture from previous step
    //r channel: whether in obstacle or not (accumulated)
    //g channel: height of water displaced (accumulated)
    //b channel: height of water displaced from previous step (accumulated)
    //a channel: height of water displaced (only for current rendered object)
    vec4 t = texture2D(uObstaclesTexture, vUv);

    //read texture for obstacle
    //r, g, b channels: depth (all these channels contain same value)
    //a channel: alpha
    vec4 tTop = texture2D(uObstacleTopTexture, vUv);
    vec4 tBottom = texture2D(uObstacleBottomTexture, vec2(vUv.x, 1.0-vUv.y));

    //read texture for water and terrain
    //r channel: height
    //other channels: other data which are not used here
    vec4 tWater = texture2D(uWaterTexture, vUv);
    vec4 tTerrain = texture2D(uTerrainTexture, vUv);
    float waterHeight = tWater.r + tTerrain.r;

    //convert top and bottom into same space (water plane at height of 0, upwards positive)
    float bottomHeight = (tBottom.r - uHalfRange - waterHeight) * tBottom.a;
    float topHeight = (uHalfRange - waterHeight - tTop.r) * tTop.a;

    //compare the top and bottom depths to determine if water is in obstacle
    bool inObstacle = bottomHeight < 0.0 && topHeight > 0.0;

    //also calculate amount of water displaced
    float displacedHeight;
    if (bottomHeight > 0.0) {
        //totally above water, so there is no water displaced
        displacedHeight = 0.0;
    } else if (topHeight < 0.0) {
        //totally below water, so water displaced height is top minus bottom
        displacedHeight = topHeight - bottomHeight;
    } else {
        //partially submerged, so water displaced is water level minus bottom (which is just negative of bottom)
        displacedHeight = -bottomHeight;
    }

    //write out to texture for next step
    gl_FragColor = vec4(max(t.r, float(inObstacle)), t.g + displacedHeight, t.b, displacedHeight);
}