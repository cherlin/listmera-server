const spotify = require('../secrets/spotifyConf.js');
const { removeAdmin, findUser, registerModel, loginModel } = require('./userModel.js');
const { setExpiry } = require('./playlistModel.js');

async function getFeatures(tracks, refresh) {
  await spotify.setRefreshToken(refresh);
  await spotify.refreshAccessToken()
    .then(async data => {
      await spotify.setAccessToken(data.body['access_token']);
    })
    .catch(e => console.error(e));
  return await spotify.getAudioFeaturesForTracks([...tracks]);
}

async function generatePlaylist(playlist, refresh, identifier, copy, copier) {
  let playlistId;
  let tracks = playlist.tracks.map(el => `spotify:track:${el}`);
  await spotify.setRefreshToken(refresh);
  await spotify.refreshAccessToken()
    .then(async data => {
      await spotify.setAccessToken(data.body['access_token']);
    })
    .catch(e => console.error(e));
  if (!playlist.strict) {
    let seed;
    let attributes;
    if (playlist.tracks.length <= 5) seed = playlist.tracks;
    else seed = playlist.tracks.slice(0,5);
    const keys = [
      'dance',
      'energy',
      'loud',
      'instrumental',
      'live',
      'mood',
      'major',
      'minor',
      'tempo',
    ];
    let flag = false;
    attributes = Object.keys(playlist)
      .filter(el => ~keys.indexOf(el))
      .reduce((acc, el) => {
        if (el === 'dance') {
          return {
            ...acc,
            [`min_danceability`]: Number(playlist[el])
          }
        }
        if (el === 'energy') {
          return {
            ...acc, 
            [`min_energy`]: Number(playlist[el])
          }
        }
        if (el === 'instrumental') {
          return {
            ...acc,
            [`min_instrumentalness`]: Number(playlist[el])
          }
        }
        if (el === 'live') {
          return {
            ...acc,
            [`min_liveness`]: Number(playlist[el])
          }
        }
        if (el === 'loud') {
          return {
            ...acc,
            [`max_loudness`]: Number(playlist[el])
          }
        } 
        if (el === 'tempo') {
          return {
            ...acc,
            [`target_tempo`]: Number(playlist[el])
          }
        }
        if (el === 'mood') {
          return (playlist[el] === 0)
            ? ({
              ...acc,
              [`max_valence`]: 0.5
            })
            : ({
              ...acc,
              [`min_valence`]: 0.5
            });
        }
        if (el === 'minor') {
          if (flag) {
            return {
              ...acc,
              [`target_mode`]: false
            };
          } else {
            flag = true
            return {
              ...acc,
              [`target_mode`]: 0
            };
          }
        }
        if (el === 'major') {
          if (flag) {
            return {
              ...acc,
              [`target_mode`]: false
            };
          } else {
            flag = true
            return {
              ...acc,
              [`target_mode`]: 1
            };
          }
        }
      }, {
        limit: (50-playlist.tracks.length),
        seed_tracks: seed
      });
    let recommended = await spotify.getRecommendations(attributes)
      .then(res => res.body.tracks.map(el => `spotify:track:${el.id}`));
    tracks = tracks.concat(recommended);
  }
  if (!copy) {
    await spotify.generatePlaylist(playlist.adminId, playlist.name, {description: 'powered by listmera'})
      .then(res => {
        playlistId = res.body.id;
      })
      .catch(e => console.error(e));
    await spotify.addTracksToPlaylist(playlist.adminId, playlistId, tracks)
      .catch(e => console.error(e));
    await removeAdmin({
      username: playlist.adminId,
      id: identifier,
    });
    await setExpiry({
      playlist: identifier,
      bank: playlist.bank,
      tracks: playlist.trackId,
      collabs: playlist.collabs
    });
  } else {
    await spotify.generatePlaylist(copier.username, playlist.name, {description: 'powered by listmera'})
    .then(res => {
      playlistId = res.body.id;
    })
    .catch(e => console.error(e));
    await spotify.addTracksToPlaylist(copier.username, playlistId, tracks)
      .catch(e => console.error(e));
  }
}

async function getAuth(code) {
  const newUser = {};
  let flag = false;
  await spotify.authorizationCodeGrant(code)
  .then(async res => {
    await spotify.setAccessToken(res.body['access_token']);
    await spotify.setRefreshToken(res.body['refresh_token']);
    newUser.token = res.body['access_token'];
    newUser.refresh = res.body['refresh_token'];
  });
  await spotify.getMe()
    .then(async res => {
      const exist = await findUser(res.body.id);
      if (exist.length > 0) flag = true;
      if (res.body['images'][0]) newUser.picture = res.body['images'][0].url;
      else newUser.picture = undefined;
      newUser.email = res.body.email;
      newUser.username = res.body.id;
      newUser.name = res.body.display_name ? res.body.display_name : res.body.id;
    }).catch(e => console.error(e));
  if (flag) return loginModel(newUser);
  else {
    await spotify.getUserPlaylists(newUser.username, {limit: 50})
      .then(async res => {
        let completePlaylists = await Promise.all(res.body.items.map(async el => {
          let mappedTracks;
          await spotify.getPlaylistTracks(newUser.username, el.id)
            .then(res => {
              mappedTracks = res.body.items.map(el => {
                return {
                  id: el.track.id,
                  name: el.track.name ? el.track.name : 'Unknown',
                  mature: el.track.explicit ? el.track.explicit : false,
                  popularity: el.track.popularity ? el.track.popularity : 0,
                  artists: el.track.artists.length > 1 ? 'Various Artists' : el.track.artists[0].name || 'Unknown',
                  image: el.track.album.images[0].url ? el.track.album.images[0].url : undefined,
                  album: el.track.album.name ? el.track.album.name : 'Unknown',
                }
              });
            })
            .catch(e => mappedTracks = false);
          if (mappedTracks) return {id: el.id, name: el.name, tracks: mappedTracks};
        })).catch(e => console.error(e));
        newUser.playlists = completePlaylists;
      });
  }
  return await registerModel(newUser);
}

module.exports = {
  getFeatures,
  generatePlaylist,
  getAuth
}