# Local Network Viewing

Date: **AUG.13.2026**

`cribd` serves its WebRTC player to devices on the local network.

Set `CRIBD_HOST` to the development Mac's LAN address:

```sh
CRIBD_HOST=192.168.1.10 ./bin/cribd
```

Open `http://192.168.1.10:8889/crib` from another device on the same network.

The launcher binds MediaMTX's WebRTC HTTP and UDP ports to the configured address and advertises it to WebRTC clients. Without `CRIBD_HOST`, access remains loopback-only. Remote access, authentication, and TLS are not included.
